import { RUNNER_AWAIT_TIMEOUT_MS } from './agent-runner-generate';
import { forgeDebug } from '@forge-runtime/core';

import { withTimeout } from '../utils/async';
import {
  nextBackoff as backoffNextBackoff,
  resetBackoff as backoffResetBackoff,
  setInstant as backoffSetInstant,
  calculateDelayMs as calcDelayMs,
} from './agent-runner-scheduler-backoff';
import { advanceStepEpoch as epochAdvanceStepEpoch } from './agent-runner-scheduler-epoch';
import { createSchedulerHealthcheck } from './agent-runner-scheduler-healthcheck';
import { createSchedulerSteps } from './agent-runner-scheduler-steps';
const _RUNNER_HEALTHCHECK_INTERVAL_MS = 30_000;
import { createFlushManager, type FlushManager } from './agent-runner-flush-manager';
import { createTimerManager } from './agent-runner-timer-manager';
import { createRunLifecycle } from './agent-runner-run-lifecycle';

export type Scheduler = {
  getState(): SchedulerState;
  scheduleNextStep(delayMs: number, stepFn?: () => void): void;
  clearTimer(): void;
  setNextStepAt(timestamp: number): void;
  isTimerActive(): boolean;
  nextBackoff(): number;
  resetBackoff(): void;
  setInstant(value: boolean): void;
  calculateDelayMs(
    endsAt: number,
    remainingBudgetUsd: number,
    estimatedStepUsd: number | null,
  ): number;
  planNextStepDelay(): Promise<void>;
  startNewRunEpoch(): void;
  isStaleRun(runEpoch: number): boolean;
  invalidateInFlightGenerate(): void;
  startGenerateAttempt(controller: AbortController): number;
  finishGenerateAttempt(generateToken: number, controller: AbortController): void;
  advanceGenerateToken(): void;
  getGenerateToken(): number;
  start(now: number): void;
  stop(): void;
  forceIdle(): Promise<void>;
  transitionToIdle(runEpoch: number, opts?: { deferWakeQueueDrain?: boolean }): Promise<void>;
  startHealthcheck(now: number): void;
  clearHealthcheck(): void;
  shouldRunHealthcheckAt(now: number): boolean;
  getHealthcheckIntervalMs(): number;
  scheduleAt(timestamp: number): void;
  beginRun(runEpoch: number): Promise<void>;
  queueNextStep(runEpoch: number): Promise<void>;
  refreshRunFlushSettings(): Promise<void>;
  resetFlushedRunEventKeys(): void;
  rememberFlushedRunEventKey(key: string): void;
  isFlushed(key: string): boolean;
  clearFlushHistory(): void;
  getFlushSettings(): {
    communicationDmFlushingEnabled: boolean;
    communicationGroupFlushingEnabled: boolean;
  };
  isLocallyIdle(): boolean;
  setExecuting(value: boolean): void;
  isExecuting(): boolean;
  isStartingRun(): boolean;
  getStartingRunAgeMs(): number;
  getRunId(): string | null;
  setRunId(id: string): void;
  getRunLastMessages(): number;
  getInstant(): boolean;
  getBackoffMs(): number;
  getNextStepAt(): number | null;
  getActiveRunEpoch(): number;
  getActiveStepEpoch(): number;
  advanceStepEpoch(): void;
  setStepCallback(cb: (runEpoch: number) => Promise<void>): void;
  getAbortController(): AbortController | null;
  getHealthcheckTimer(): ReturnType<typeof setTimeout> | null;
  isStopped(): boolean;
};

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

export function createScheduler(state: SchedulerState, deps: SchedulerDependencies) {
  // Healthcheck callbacks — set when the runner starts and when beginRun is configured
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
  const runLifecycle = createRunLifecycle(state, {
    get stopped() {
      return stopped;
    },
  });
  const healthcheck = createSchedulerHealthcheck({ runtimeId: deps.runtimeId });
  const steps = createSchedulerSteps({
    runtimeId: deps.runtimeId,
    getRunnableContract: deps.getRunnableContract,
    onAgentIdle: deps.onAgentIdle,
    isStaleRun,
    startNewRunEpoch,
    scheduleNextStep,
    planNextStepDelay,
    resetBackoff,
    advanceStepEpoch,
    getActiveRunEpoch: () => state.activeRunEpoch,
    setInstant,
    flushManager: flushManager as FlushManager,
    getExecuting: () => executing,
    isTimerActive: () => timerManager.isTimerActive(),
    isStopped: () => stopped,
    getStartingRun: () => ({ running: startingRun, startedAt: startingRunStartedAt }),
    setStartingRun: (r: boolean, s: number | null) => {
      startingRun = r;
      startingRunStartedAt = s;
    },
  });

  // Step callback — set by the runner orchestrator
  let _stepCallback: ((runEpoch: number) => Promise<void>) | null = null;

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

      return state.instant || !settings.stepDelayEnabled
        ? 0
        : calculateDelayMs(contract.endsAt, remainingBudgetUsd, estimatedStepUsd);
    } catch (error) {
      forgeDebug({
        scope: 'scheduler',
        level: 'error',
        message: 'planNextStepDelay failed',
        context: { runtimeId: deps.runtimeId, error },
      });
      return -1;
    }
  }

  function scheduleNextStep(delayMs: number, stepFn?: () => void) {
    timerManager.scheduleNextStep(delayMs);
    if (stepFn) {
      timerManager.setStepFn(stepFn);
    }
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

  function advanceGenerateToken(): void {
    runLifecycle.advanceGenerateToken();
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
    beginRunFn: (opts: {
      reloadRuntime: boolean;
      wakeStartedAt: number;
      markRunning: boolean;
    }) => Promise<void>,
  ) {
    if (stopped) {
      return;
    }

    try {
      healthcheck.startHealthcheck();
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
      forgeDebug({
        scope: 'scheduler',
        level: 'error',
        message: 'start failed',
        context: { runtimeId: deps.runtimeId, error },
      });
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
    healthcheck.clearHealthcheck();
    flushManager.resetFlushedRunEventKeys();
  }

  async function forceIdle(
    setExecutionState: (runtimeId: string, state: 'idle' | 'running' | 'absent') => Promise<void>,
    onAgentIdle?: () => Promise<void>,
    _options: {
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
      forgeDebug({
        scope: 'scheduler',
        level: 'error',
        message: 'forceIdle setExecutionState failed',
        context: { runtimeId: deps.runtimeId, error },
      });
    }
    try {
      await withTimeout(
        deps.onAgentIdle?.() ?? Promise.resolve(),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent long-term memory idle transition timed out for ${deps.runtimeId}`,
      );
    } catch (error) {
      forgeDebug({
        scope: 'scheduler',
        level: 'error',
        message: 'forceIdle onAgentIdle failed',
        context: { runtimeId: deps.runtimeId, error },
      });
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
      forgeDebug({
        scope: 'scheduler',
        level: 'error',
        message: 'transitionToIdle setExecutionState failed',
        context: { runtimeId: deps.runtimeId, error },
      });
    }
    try {
      await withTimeout(
        deps.onAgentIdle?.() ?? Promise.resolve(),
        RUNNER_AWAIT_TIMEOUT_MS,
        `Agent long-term memory idle transition timed out for ${deps.runtimeId}`,
      );
    } catch (error) {
      forgeDebug({
        scope: 'scheduler',
        level: 'error',
        message: 'transitionToIdle onAgentIdle failed',
        context: { runtimeId: deps.runtimeId, error },
      });
    }

    if (isStaleRun(runEpoch)) {
      return;
    }

    if (options.deferWakeQueueDrain === true) {
      return;
    }

    try {
      await onRunnerIdle();
    } catch (error) {
      forgeDebug({
        scope: 'scheduler',
        level: 'error',
        message: 'transitionToIdle onRunnerIdle failed',
        context: { runtimeId: deps.runtimeId, error },
      });
    }
  }

  // Step orchestration — delegated to steps module
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

  function _getRunLastMessages(): number {
    return flushManager.getRunLastMessages();
  }

  function getInstant(): boolean {
    return state.instant;
  }
  function getBackoffMs(): number {
    return state.backoffMs;
  }
  function getNextStepAt(): number | null {
    return state.nextStepAt;
  }
  function getActiveRunEpoch(): number {
    return state.activeRunEpoch;
  }

  function getActiveStepEpoch(): number {
    return state.activeStepEpoch;
  }

  function advanceStepEpoch() {
    epochAdvanceStepEpoch(state);
  }

  function setStepCallback(fn: (runEpoch: number) => Promise<void>) {
    _stepCallback = fn;
  }

  function getAbortController(): AbortController | null {
    return runLifecycle.getAbortController();
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
    advanceGenerateToken,
    getGenerateToken,
    // Lifecycle
    start,
    stop,
    forceIdle,
    transitionToIdle,
    // Healthcheck — delegated to healthcheck module
    startHealthcheck: healthcheck.startHealthcheck.bind(healthcheck),
    clearHealthcheck: healthcheck.clearHealthcheck.bind(healthcheck),
    shouldRunHealthcheckAt: healthcheck.shouldRunHealthcheckAt.bind(healthcheck),
    getHealthcheckIntervalMs: healthcheck.getHealthcheckIntervalMs.bind(healthcheck),
    scheduleAt,
    // Step orchestration — delegated to steps module
    beginRun: steps.beginRun.bind(steps),
    queueNextStep: steps.queueNextStep.bind(steps),
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
    getHealthcheckTimer: healthcheck.getHealthcheckTimer.bind(healthcheck),
    getState: () => ({ ...state }),
    isStopped: () => stopped,
  };
}
