import { ONE_MINUTE_MS, TEN_MINUTES_MS, FIFTEEN_MINUTES_MS } from './time-constants.js';
import { createId } from '../utils/id';
import { withTimeout } from '../utils/async';
const RUNNER_AWAIT_TIMEOUT_MS = 30_000;
const STARTING_RUN_TIMEOUT_MS = RUNNER_AWAIT_TIMEOUT_MS * 2;
const RUNNER_HEALTHCHECK_INTERVAL_MS = 30_000;

export type SchedulerState = {
  nextStepAt: number | null;
  backoffMs: number;
  instant: boolean;
  activeRunEpoch: number;
  activeStepEpoch: number;
  activeGenerateToken: number;
  isStopped: boolean;
};

export type SchedulerDependencies = {
  getSystemSettings(): Promise<{
    stepDelayEnabled: boolean;
    memoryLastMessagesFullEnabled: boolean;
    memoryLastMessagesCount?: number;
    communicationDmFlushingEnabled: boolean;
    communicationGroupFlushingEnabled: boolean;
  }>;
  getRunnableContract(runtimeId: string): Promise<{
    id: string;
    budgetUsd: number;
    endsAt: number;
  } | null>;
  getContractSpend(contractId: string): Promise<number>;
  estimateStepCostUsd(): Promise<number | null>;
  runtimeId: string;
  setExecutionState(runtimeId: string, state: 'idle' | 'running' | 'absent'): Promise<void>;
  onAgentIdle?(): Promise<void>;
};

export function createScheduler(
  state: SchedulerState,
  deps: SchedulerDependencies,
) {
  let healthcheckTimer: NodeJS.Timeout | null = null;
  // Healthcheck callbacks — set when the runner starts and when beginRun is configured
  let healthcheckGetExecutionState: ((runtimeId: string) => Promise<'idle' | 'running' | 'absent'>) | null = null;
  let healthcheckOnRunnerIdle: (() => Promise<void>) | null = null;
  let healthcheckBeginRunFn: ((opts: { reloadRuntime: boolean; wakeStartedAt: number; markRunning: boolean }) => Promise<void>) | null = null;
  let healthcheckGetPendingCount: (() => number) | null = null;
  let timer: NodeJS.Timeout | null = null;
  let stopped = false;
  let startingRun = false;
  let startingRunStartedAt: number | null = null;
  let executing = false;
  let activeRunId: string | null = null;
  let currentGenerateAbortController: AbortController | null = null;
  let runLastMessages = 20;
  const DEFAULT_RUN_LAST_MESSAGES = 20;
  const FULL_MEMORY_LOAD_LAST_MESSAGES = Number.MAX_SAFE_INTEGER;
  const MAX_FLUSHED_RUN_EVENT_KEYS = 2_000;

  const flushedRunEventKeys = new Set<string>();
  const flushedRunEventKeyOrder: string[] = [];
  let currentFlushSettings = {
    communicationDmFlushingEnabled: true,
    communicationGroupFlushingEnabled: true,
  };

  // Step callback — set by the runner orchestrator
  let stepCallback: ((runEpoch: number) => Promise<void>) | null = null;

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    state.nextStepAt = null;
  }

  function setNextStepAt(timestamp: number) {
    state.nextStepAt = timestamp;
  }

  function isTimerActive(): boolean {
    return timer !== null || state.nextStepAt !== null;
  }

  function nextBackoff(): number {
    const delayMs = state.backoffMs;
    state.backoffMs = Math.min(state.backoffMs * 2, TEN_MINUTES_MS);
    return delayMs;
  }

  function resetBackoff() {
    state.backoffMs = ONE_MINUTE_MS;
  }

  function setInstant(value: boolean) {
    state.instant = value;
  }

  function calculateDelayMs(
    endsAt: number,
    remainingBudgetUsd: number,
    estimatedStepUsd: number | null,
  ): number {
    if (estimatedStepUsd === null || estimatedStepUsd <= 0) {
      return 0;
    }

    const remainingTimeMs = endsAt - Date.now();
    const stepsPossible = remainingBudgetUsd / estimatedStepUsd;

    if (remainingTimeMs <= 0 || stepsPossible <= 0) {
      return 0;
    }

    return remainingTimeMs / stepsPossible;
  }

  async function planNextStepDelay(): Promise<number> {
    const contract = await deps.getRunnableContract(deps.runtimeId);

    if (!contract) {
      return -1; // signal to go idle
    }

    const spentUsd = await deps.getContractSpend(contract.id);
    const remainingBudgetUsd = contract.budgetUsd - spentUsd;
    const estimatedStepUsd = await deps.estimateStepCostUsd();

    if (estimatedStepUsd !== null && remainingBudgetUsd < estimatedStepUsd) {
      return -1;
    }

    resetBackoff();
    const settings = await deps.getSystemSettings();

    return state.instant
      || !settings.stepDelayEnabled
      ? 0
      : calculateDelayMs(contract.endsAt, remainingBudgetUsd, estimatedStepUsd);
  }

  function scheduleNextStep(delayMs: number, stepFn?: () => void) {
    clearTimer();
    state.nextStepAt = Date.now() + delayMs;
    timer = setTimeout(() => {
      timer = null;
      state.nextStepAt = null;
      if (stepFn) { stepFn(); }
    }, Math.max(delayMs, 0));
  }

  // ─── Run epoch management ───────────────────────────────────────────────────

  function startNewRunEpoch(): number {
    state.activeRunEpoch += 1;
    state.activeStepEpoch = 0;
    invalidateInFlightGenerate();
    return state.activeRunEpoch;
  }

  function isStaleRun(runEpoch: number): boolean {
    return stopped || runEpoch !== state.activeRunEpoch;
  }

  function invalidateInFlightGenerate() {
    state.activeGenerateToken += 1;
    currentGenerateAbortController?.abort(new Error('Agent generate invalidated'));
    currentGenerateAbortController = null;
  }

  function startGenerateAttempt(controller: AbortController): number {
    state.activeGenerateToken += 1;
    currentGenerateAbortController = controller;
    return state.activeGenerateToken;
  }

  function finishGenerateAttempt(generateToken: number, controller: AbortController) {
    controller.abort();
    if (state.activeGenerateToken !== generateToken) {
      return;
    }
    currentGenerateAbortController = null;
  }

  function getGenerateToken(): number {
    return state.activeGenerateToken;
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async function start(
    getExecutionState: (runtimeId: string) => Promise<'idle' | 'running' | 'absent'>,
    beginRunFn: (opts: { reloadRuntime: boolean; wakeStartedAt: number; markRunning: boolean }) => Promise<void>,
  ) {
    if (stopped) {
      return;
    }

    healthcheckGetExecutionState = getExecutionState;
    healthcheckBeginRunFn = beginRunFn;
    startHealthcheck();
    await refreshRunFlushSettings();

    const executionState = await withTimeout(
      getExecutionState(deps.runtimeId),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state lookup timed out for ${deps.runtimeId}`,
    );

    if (executionState === 'idle') {
      await deps.onAgentIdle?.();
      return;
    }

    if (executionState === 'absent') {
      await beginRunFn({
        reloadRuntime: false,
        wakeStartedAt: Date.now(),
        markRunning: true,
      });
      return;
    }

    await beginRunFn({
      reloadRuntime: false,
      wakeStartedAt: Date.now(),
      markRunning: false,
    });
  }

  function stop() {
    stopped = true;
    startingRun = false;
    startingRunStartedAt = null;
    state.activeRunEpoch += 1;
    state.activeStepEpoch = 0;
    activeRunId = null;
    invalidateInFlightGenerate();
    executing = false;
    clearTimer();
    clearHealthcheck();
    resetFlushedRunEventKeys();
  }

  async function forceIdle(
    setExecutionState: (runtimeId: string, state: 'idle' | 'running' | 'absent') => Promise<void>,
    onAgentIdle?: () => Promise<void>,
    options: {
      preserveQueuedWork?: boolean;
    } = {},
  ) {
    const runEpoch = startNewRunEpoch();
    startingRun = false;
    startingRunStartedAt = null;
    executing = false;
    clearTimer();
    // Caller clears wakeQueue if needed via returned handle
    resetFlushedRunEventKeys();
    state.instant = false;
    await withTimeout(
      setExecutionState(deps.runtimeId, 'idle'),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state update timed out for ${deps.runtimeId}`,
    );
    await withTimeout(
      deps.onAgentIdle?.() ?? Promise.resolve(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent long-term memory idle transition timed out for ${deps.runtimeId}`,
    );

    if (isStaleRun(runEpoch)) {
      return;
    }

    state.nextStepAt = null;
  }

  async function transitionToIdle(
    runEpoch: number,
    setExecutionState: (runtimeId: string, state: 'idle' | 'running' | 'absent') => Promise<void>,
    onRunnerIdle: () => Promise<void>,
    options: {
      deferWakeQueueDrain?: boolean;
    } = {},
  ) {
    if (isStaleRun(runEpoch)) {
      return;
    }

    clearTimer();
    invalidateInFlightGenerate();
    state.instant = false;
    await withTimeout(
      setExecutionState(deps.runtimeId, 'idle'),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state update timed out for ${deps.runtimeId}`,
    );
    await withTimeout(
      deps.onAgentIdle?.() ?? Promise.resolve(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent long-term memory idle transition timed out for ${deps.runtimeId}`,
    );

    if (isStaleRun(runEpoch)) {
      return;
    }

    if (options.deferWakeQueueDrain) {
      return;
    }

    await onRunnerIdle();
  }

  // ─── Healthcheck ────────────────────────────────────────────────────────────

  function startHealthcheck() {
    if (healthcheckTimer) {
      return;
    }

    healthcheckTimer = setInterval(() => {
      void runHealthcheck(healthcheckGetExecutionState!, healthcheckOnRunnerIdle!, healthcheckBeginRunFn!, healthcheckGetPendingCount!);
    }, RUNNER_HEALTHCHECK_INTERVAL_MS);
  }

  function clearHealthcheck() {
    if (!healthcheckTimer) {
      return;
    }

    clearInterval(healthcheckTimer);
    healthcheckTimer = null;
  }

  async function runHealthcheck(
    getExecutionState: (runtimeId: string) => Promise<'idle' | 'running' | 'absent'>,
    onRunnerIdle: () => Promise<void>,
    beginRunFn: (opts: { reloadRuntime: boolean; wakeStartedAt: number; markRunning: boolean }) => Promise<void>,
    getPendingCount: () => number,
  ) {
    if (stopped) {
      return;
    }

    try {
      const executionState = await withTimeout(
        getExecutionState(deps.runtimeId),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state lookup timed out for ${deps.runtimeId}`,
      );

      if (executionState === 'idle') {
        if (!isLocallyIdle()) {
          return;
        }

        if (getPendingCount() > 0) {
          await beginRunFn({
            reloadRuntime: false,
            wakeStartedAt: Date.now(),
            markRunning: true,
          });
          return;
        }

        await onRunnerIdle();
        return;
      }

      if (startingRun) {
        const startingRunAgeMs =
          startingRunStartedAt === null ? 0 : Date.now() - startingRunStartedAt;

        if (startingRunAgeMs >= STARTING_RUN_TIMEOUT_MS) {
          startNewRunEpoch();
          startingRun = false;
          startingRunStartedAt = null;
          activeRunId = null;
        }
      }

      if (startingRun || executing || timer) {
        return;
      }

      await queueNextStep();
    } catch (error) {
      // Healthcheck errors are non-fatal — log and continue
    }
  }

  // ─── Step orchestration ─────────────────────────────────────────────────────

  async function beginRun(
    runEpoch: number,
    input: {
      reloadRuntime: boolean;
      wakeStartedAt: number;
      markRunning: boolean;
      onReloadRuntime: (runEpoch: number) => Promise<void>;
      setExecutionState: (runtimeId: string, state: 'idle' | 'running' | 'absent') => Promise<void>;
      onAgentRunning: () => void;
      onRunnerIdle: () => Promise<void>;
      getPendingCount: () => number;
    },
  ) {
    if (stopped || startingRun) {
      return;
    }

    startingRun = true;
    startingRunStartedAt = Date.now();
    const myRunEpoch = startNewRunEpoch();

    try {
      activeRunId = createId();
      state.instant = true;
      // Store healthcheck callbacks from beginRun input
      healthcheckOnRunnerIdle = input.onRunnerIdle;
      healthcheckGetPendingCount = input.getPendingCount;
      resetBackoff();
      resetFlushedRunEventKeys();
      await refreshRunFlushSettings();

      if (input.reloadRuntime) {
        await input.onReloadRuntime(myRunEpoch);
      }

      if (isStaleRun(myRunEpoch)) {
        return;
      }

      input.onAgentRunning();

      if (input.markRunning) {
        await withTimeout(
          input.setExecutionState(deps.runtimeId, 'running'),
          RUNNER_AWAIT_TIMEOUT_MS,
          `Agent execution state update timed out for ${deps.runtimeId}`,
        );
      }

      if (isStaleRun(myRunEpoch)) {
        return;
      }

      await queueNextStep();
    } catch (error) {
      if (!isStaleRun(myRunEpoch)) {
        await transitionToIdle(myRunEpoch, input.setExecutionState, input.onRunnerIdle, {
          deferWakeQueueDrain: true,
        });
      }
    } finally {
      startingRun = false;
      startingRunStartedAt = null;
    }
  }

  async function queueNextStep() {
    if (stopped || executing || timer || isStaleRun(state.activeRunEpoch)) {
      return;
    }

    const executionState = await withTimeout(
      deps.getRunnableContract(deps.runtimeId)
        .then(c => c ? 'running' : 'idle')
        .catch(() => 'idle'),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state lookup timed out for ${deps.runtimeId}`,
    );

    if (executionState === 'idle' || isStaleRun(state.activeRunEpoch)) {
      return;
    }

    const nextDelayMs = await planNextStepDelay();

    if (isStaleRun(state.activeRunEpoch)) {
      return;
    }

    if (nextDelayMs < 0) {
      // Signal to go idle
      return;
    }

    scheduleNextStep(nextDelayMs, () => {
      if (stepCallback) {
        void stepCallback(state.activeRunEpoch);
      }
    });
  }

  // ─── Flush settings ────────────────────────────────────────────────────────

  async function refreshRunFlushSettings() {
    const settings = await withTimeout(
      deps.getSystemSettings(),
      RUNNER_AWAIT_TIMEOUT_MS,
      `System settings lookup timed out for ${deps.runtimeId}`,
    );

    currentFlushSettings = {
      communicationDmFlushingEnabled: settings.communicationDmFlushingEnabled,
      communicationGroupFlushingEnabled: settings.communicationGroupFlushingEnabled,
    };

    if (settings.memoryLastMessagesFullEnabled) {
      runLastMessages = FULL_MEMORY_LOAD_LAST_MESSAGES;
      return;
    }

    runLastMessages = settings.memoryLastMessagesCount || DEFAULT_RUN_LAST_MESSAGES;
  }

  function resetFlushedRunEventKeys() {
    flushedRunEventKeys.clear();
    flushedRunEventKeyOrder.length = 0;
  }

  function rememberFlushedRunEventKey(idempotencyKey: string) {
    if (flushedRunEventKeys.has(idempotencyKey)) {
      return;
    }

    flushedRunEventKeys.add(idempotencyKey);
    flushedRunEventKeyOrder.push(idempotencyKey);

    while (flushedRunEventKeyOrder.length > MAX_FLUSHED_RUN_EVENT_KEYS) {
      const oldestIdempotencyKey = flushedRunEventKeyOrder.shift();
      if (!oldestIdempotencyKey) {
        return;
      }
      flushedRunEventKeys.delete(oldestIdempotencyKey);
    }
  }

  function isFlushed(key: string): boolean {
    return flushedRunEventKeys.has(key);
  }

  function clearFlushHistory() {
    resetFlushedRunEventKeys();
  }

  function getFlushSettings() {
    return { ...currentFlushSettings };
  }

  // ─── State accessors ────────────────────────────────────────────────────────

  function isLocallyIdle(): boolean {
    return !startingRun && !executing && !timer;
  }

  function setExecuting(value: boolean) {
    executing = value;
  }

  function isExecuting(): boolean {
    return executing;
  }

  function isStartingRun(): boolean {
    return startingRun;
  }

  function getStartingRunAgeMs(): number {
    return startingRunStartedAt === null ? 0 : Date.now() - startingRunStartedAt;
  }

  function getRunId(): string | null {
    return activeRunId;
  }

  function setRunId(id: string) {
    activeRunId = id;
  }

  function getRunLastMessages(): number {
    return runLastMessages;
  }

  function getActiveStepEpoch(): number {
    return state.activeStepEpoch;
  }

  function advanceStepEpoch() {
    state.activeStepEpoch += 1;
  }

  function setStepCallback(fn: (runEpoch: number) => Promise<void>) {
    stepCallback = fn;
  }

  function getAbortController(): AbortController | null {
    return currentGenerateAbortController;
  }

  function getHealthcheckTimer(): NodeJS.Timeout | null {
    return healthcheckTimer;
  }

  function getTimer(): NodeJS.Timeout | null {
    return timer;
  }

  return {
    // Timer / scheduling
    clearTimer,
    setNextStepAt,
    isTimerActive,
    nextBackoff,
    resetBackoff,
    setInstant,
    calculateDelayMs,
    planNextStepDelay,
    scheduleNextStep,
    // Run epoch
    startNewRunEpoch,
    isStaleRun,
    invalidateInFlightGenerate,
    startGenerateAttempt,
    finishGenerateAttempt,
    getGenerateToken,
    // Lifecycle
    start,
    stop,
    forceIdle,
    transitionToIdle,
    // Healthcheck
    startHealthcheck,
    clearHealthcheck,
    runHealthcheck,
    // Step orchestration
    beginRun,
    queueNextStep,
    // Flush settings
    refreshRunFlushSettings,
    resetFlushedRunEventKeys,
    rememberFlushedRunEventKey,
    isFlushed,
    clearFlushHistory,
    getFlushSettings,
    // State accessors
    isLocallyIdle,
    setExecuting,
    isExecuting,
    isStartingRun,
    getStartingRunAgeMs,
    getRunId,
    setRunId,
    getRunLastMessages,
    getActiveStepEpoch,
    advanceStepEpoch,
    setStepCallback,
    getAbortController,
    getHealthcheckTimer,
    getTimer,
    getState: () => ({ ...state }),
    isStopped: () => stopped,
  };
}
