import { ONE_MINUTE_MS, TEN_MINUTES_MS, FIFTEEN_MINUTES_MS } from './time-constants';
import { forgeDebug } from '@forge-runtime/core';
import { createId } from '../utils/id';
import { withTimeout } from '../utils/async';
import {
  nextBackoff as backoffNextBackoff,
  resetBackoff as backoffResetBackoff,
  setInstant as backoffSetInstant,
  calculateDelayMs as calcDelayMs,
} from './agent-runner-scheduler-backoff';
import {
  advanceStepEpoch as epochAdvanceStepEpoch,
} from './agent-runner-scheduler-epoch';
const RUNNER_AWAIT_TIMEOUT_MS = 30_000;
const STARTING_RUN_TIMEOUT_MS = RUNNER_AWAIT_TIMEOUT_MS * 2;
const RUNNER_HEALTHCHECK_INTERVAL_MS = 30_000;
import { createFlushManager } from './agent-runner-flush-manager';
import { createTimerManager } from './agent-runner-timer-manager';
import { createRunLifecycle } from './agent-runner-run-lifecycle';

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
  let healthcheckNextAt: number | null = null;
  // timer managed by timerManager
  let stopped = false;
  let startingRun = false;
  let startingRunStartedAt: number | null = null;
  let executing = false;
  let activeRunId: string | null = null;
  const flushManager = createFlushManager({
    runtimeId: deps.runtimeId,
    getSystemSettings: deps.getSystemSettings,
  });
  const timerManager = createTimerManager(state);
  const runLifecycle = createRunLifecycle(state, { get stopped() { return stopped; } });

  // Step callback — set by the runner orchestrator
  let stepCallback: ((runEpoch: number) => Promise<void>) | null = null;

  function clearTimer() {
    timerManager.clearTimer();
  }

  function setNextStepAt(timestamp: number) {
    timerManager.setNextStepAt(timestamp);
  }

  function isTimerActive(): boolean {
    return timerManager.isTimerActive();
  }

  function nextBackoff(): number {
    return backoffNextBackoff(state);
  }

  function resetBackoff() {
    backoffResetBackoff(state);
  }

  function setInstant(value: boolean) {
    backoffSetInstant(state, value);
  }

  function calculateDelayMs(
    endsAt: number,
    remainingBudgetUsd: number,
    estimatedStepUsd: number | null,
  ): number {
    return calcDelayMs(endsAt, remainingBudgetUsd, estimatedStepUsd);
  }

  async function planNextStepDelay(): Promise<number> {
    try {
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
    } catch (error) {
      forgeDebug({ scope: 'scheduler', level: 'error', message: 'planNextStepDelay failed', context: { runtimeId: deps.runtimeId, error } });
      return -1;
    }
  }

  function scheduleNextStep(delayMs: number, stepFn?: () => void) {
    timerManager.scheduleNextStep(delayMs);
    if (stepFn) { timerManager.setStepFn(stepFn); }
  }

  /**
   * External scheduling interface.
   * Sets the next step timestamp; caller is responsible for calling
   * stepCallback(externalRunEpoch) via setTimeout.
   */
  function scheduleAt(timestamp: number) {
    timerManager.scheduleAt(timestamp);
  }

  // ─── Run epoch management ───────────────────────────────────────────────────

  function startNewRunEpoch(): number {
    return runLifecycle.startNewRunEpoch();
  }

  function isStaleRun(runEpoch: number): boolean {
    return runLifecycle.isStaleRun(runEpoch);
  }

  function invalidateInFlightGenerate() {
    runLifecycle.invalidateInFlightGenerate();
  }

  function startGenerateAttempt(controller: AbortController): number {
    return runLifecycle.startGenerateAttempt(controller);
  }

  function finishGenerateAttempt(generateToken: number, controller: AbortController) {
    runLifecycle.finishGenerateAttempt(generateToken, controller);
  }

  function getGenerateToken(): number {
    return runLifecycle.getGenerateToken();
  }

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  async function start(
    getExecutionState: (runtimeId: string) => Promise<'idle' | 'running' | 'absent'>,
    beginRunFn: (opts: { reloadRuntime: boolean; wakeStartedAt: number; markRunning: boolean }) => Promise<void>,
  ) {
    if (stopped) {
      return;
    }

    try {
      healthcheckGetExecutionState = getExecutionState;
      healthcheckBeginRunFn = beginRunFn;
      startHealthcheck();
      healthcheckNextAt = Date.now() + RUNNER_HEALTHCHECK_INTERVAL_MS;
      await flushManager.refreshRunFlushSettings();

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
          reloadRuntime: true,
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
    } catch (error) {
      forgeDebug({ scope: 'scheduler', level: 'error', message: 'start failed', context: { runtimeId: deps.runtimeId, error } });
    }
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
    flushManager.resetFlushedRunEventKeys();
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
    flushManager.resetFlushedRunEventKeys();
    state.instant = false;
    try {
      await withTimeout(
        setExecutionState(deps.runtimeId, 'idle'),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state update timed out for ${deps.runtimeId}`,
      );
    } catch (error) {
      forgeDebug({ scope: 'scheduler', level: 'error', message: 'forceIdle setExecutionState failed', context: { runtimeId: deps.runtimeId, error } });
    }
    try {
      await withTimeout(
        deps.onAgentIdle?.() ?? Promise.resolve(),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent long-term memory idle transition timed out for ${deps.runtimeId}`,
      );
    } catch (error) {
      forgeDebug({ scope: 'scheduler', level: 'error', message: 'forceIdle onAgentIdle failed', context: { runtimeId: deps.runtimeId, error } });
    }

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
    try {
      await withTimeout(
        setExecutionState(deps.runtimeId, 'idle'),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent execution state update timed out for ${deps.runtimeId}`,
      );
    } catch (error) {
      forgeDebug({ scope: 'scheduler', level: 'error', message: 'transitionToIdle setExecutionState failed', context: { runtimeId: deps.runtimeId, error } });
    }
    try {
      await withTimeout(
        deps.onAgentIdle?.() ?? Promise.resolve(),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent long-term memory idle transition timed out for ${deps.runtimeId}`,
      );
    } catch (error) {
      forgeDebug({ scope: 'scheduler', level: 'error', message: 'transitionToIdle onAgentIdle failed', context: { runtimeId: deps.runtimeId, error } });
    }

    if (isStaleRun(runEpoch)) {
      return;
    }

    if (options.deferWakeQueueDrain) {
      return;
    }

    try {
      await onRunnerIdle();
    } catch (error) {
      forgeDebug({ scope: 'scheduler', level: 'error', message: 'transitionToIdle onRunnerIdle failed', context: { runtimeId: deps.runtimeId, error } });
    }
  }

  // ─── Healthcheck ────────────────────────────────────────────────────────────

  /**
   * startHealthcheck is a no-op when using external timer management.
   */
  function startHealthcheck() {
    // No-op: external code manages the interval via getHealthcheckIntervalMs()
  }

  function clearHealthcheck() {
    if (!healthcheckTimer) {
      return;
    }

    clearInterval(healthcheckTimer);
    healthcheckTimer = null;
  }

  /**
   * External healthcheck interface.
   * shouldRunHealthcheckAt: returns true if a healthcheck should run now.
   * getHealthcheckIntervalMs: returns the interval in ms.
   */
  function shouldRunHealthcheckAt(now: number): boolean {
    if (!healthcheckNextAt) return false;
    return now >= healthcheckNextAt;
  }

  function getHealthcheckIntervalMs(): number {
    return RUNNER_HEALTHCHECK_INTERVAL_MS;
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
      flushManager.resetFlushedRunEventKeys();
      await flushManager.refreshRunFlushSettings();

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
      forgeDebug({ scope: 'scheduler', level: 'error', message: 'beginRun queueNextStep failed', context: { error: error instanceof Error ? error.message : String(error), runtimeId: deps.runtimeId } });
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
    if (stopped || executing || timerManager.isTimerActive() || isStaleRun(state.activeRunEpoch)) {
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

  // ─── Flush settings — delegated to flush manager ──────────────────────────
  // See agent-runner-flush-manager.ts

  // ─── State accessors ────────────────────────────────────────────────────────

  function isLocallyIdle(): boolean {
    return !startingRun && !executing && !timerManager.isTimerActive();
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

  function getInstant(): boolean { return state.instant; }
  function getBackoffMs(): number { return state.backoffMs; }
  function getNextStepAt(): number | null { return state.nextStepAt; }
  function getActiveRunEpoch(): number { return state.activeRunEpoch; }

  function getActiveStepEpoch(): number {
    return state.activeStepEpoch;
  }

  function advanceStepEpoch() {
    epochAdvanceStepEpoch(state);
  }

  function setStepCallback(fn: (runEpoch: number) => Promise<void>) {
    stepCallback = fn;
  }

  function getAbortController(): AbortController | null {
    return runLifecycle.getAbortController();
  }

  function getHealthcheckTimer(): NodeJS.Timeout | null {
    return healthcheckTimer;
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
    shouldRunHealthcheckAt,
    getHealthcheckIntervalMs,
    scheduleAt,
    // Step orchestration
    beginRun,
    queueNextStep,
    // Flush settings — delegated to flush manager
    refreshRunFlushSettings: flushManager.refreshRunFlushSettings.bind(flushManager),
    resetFlushedRunEventKeys: flushManager.resetFlushedRunEventKeys.bind(flushManager),
    rememberFlushedRunEventKey: flushManager.rememberFlushedRunEventKey.bind(flushManager),
    isFlushed: flushManager.isFlushed.bind(flushManager),
    clearFlushHistory: flushManager.clearFlushHistory.bind(flushManager),
    getFlushSettings: flushManager.getFlushSettings.bind(flushManager),
    // State accessors
    isLocallyIdle,
    setExecuting,
    isExecuting,
    isStartingRun,
    getStartingRunAgeMs,
    getRunId,
    setRunId,
    getRunLastMessages: flushManager.getRunLastMessages.bind(flushManager),
    getInstant,
    getBackoffMs,
    getNextStepAt,
    getActiveRunEpoch,
    getActiveStepEpoch,
    advanceStepEpoch,
    setStepCallback,
    getAbortController,
    getHealthcheckTimer,
    getState: () => ({ ...state }),
    isStopped: () => stopped,
  };
}
