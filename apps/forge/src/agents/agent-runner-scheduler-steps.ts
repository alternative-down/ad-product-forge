/**
 * agent-runner-scheduler-steps.ts
 *
 * Manages step orchestration lifecycle: beginRun and queueNextStep.
 * Extracted from agent-runner-scheduler.ts (#2257 phase 5).
 *
 * State is passed via a deps getter that returns fresh closures on each call,
 * so the module always reads current values without needing explicit rebinding.
 */

import { withTimeout } from '../utils/async';
import type { FlushManager } from './agent-runner-flush-manager';

export interface BeginRunInput {
  reloadRuntime: boolean;
  wakeStartedAt: number;
  markRunning: boolean;
  onReloadRuntime: (runEpoch: number) => Promise<void>;
  setExecutionState: (runtimeId: string, state: 'idle' | 'running' | 'absent') => Promise<void>;
  onAgentRunning: () => void;
  onRunnerIdle: () => Promise<void>;
  getPendingCount: () => number;
}

export interface StepsDeps {
  runtimeId: string;
  getRunnableContract: (runtimeId: string) => Promise<unknown>;
  onAgentIdle?: () => void;
  isStaleRun: (runEpoch: number) => boolean;
  startNewRunEpoch: () => number;
  scheduleNextStep: (delayMs: number, stepFn?: () => void) => void;
  planNextStepDelay: () => Promise<number>;
  resetBackoff: () => void;
  advanceStepEpoch: () => void;
  getActiveRunEpoch: () => number;
  setInstant: (value: boolean) => void;
  flushManager: FlushManager;
  getExecuting: () => boolean;
  isTimerActive: () => boolean;
  isStopped: () => boolean;
  getStartingRun: () => { running: boolean; startedAt: number | null };
  setStartingRun: (running: boolean, startedAt: number | null) => void;
}

export type SchedulerSteps = {
  beginRun(runEpoch: number, input: BeginRunInput): Promise<void>;
  queueNextStep(): Promise<void>;
};

const RUNNER_AWAIT_TIMEOUT_MS = 60_000;

export function createSchedulerSteps(deps: StepsDeps): SchedulerSteps {
  async function beginRun(runEpoch: number, input: BeginRunInput): Promise<void> {
    const { isStopped, getStartingRun, setStartingRun } = deps;
    if (isStopped() || getStartingRun().running) {
      return;
    }

    setStartingRun(true, Date.now());
    const myRunEpoch = deps.startNewRunEpoch();

    try {
      deps.setInstant(true);
      deps.resetBackoff();
      deps.flushManager.resetFlushedRunEventKeys();
      await deps.flushManager.refreshRunFlushSettings();

      if (input.reloadRuntime) {
        await input.onReloadRuntime(myRunEpoch);
      }

      if (deps.isStaleRun(myRunEpoch)) {
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

      if (deps.isStaleRun(myRunEpoch)) {
        return;
      }

      await queueNextStep();
    } catch (_error) {
      // beginRun errors are non-fatal — scheduler handles transitionToIdle
    } finally {
      setStartingRun(false, null);
    }
  }

  async function queueNextStep(): Promise<void> {
    const {
      isStopped,
      getExecuting,
      isTimerActive,
      isStaleRun,
      getActiveRunEpoch,
      getRunnableContract,
      runtimeId,
      scheduleNextStep,
      planNextStepDelay,
      advanceStepEpoch,
    } = deps;

    if (isStopped() || getExecuting() || isTimerActive() || isStaleRun(getActiveRunEpoch())) {
      return;
    }

    const executionState = await withTimeout(
      getRunnableContract(runtimeId)
        .then((c) => (c !== null && c !== undefined ? 'running' : 'idle'))
        .catch(() => 'idle'),
      RUNNER_AWAIT_TIMEOUT_MS,
      `Agent execution state lookup timed out for ${runtimeId}`,
    );

    if (executionState === 'idle' || isStaleRun(getActiveRunEpoch())) {
      return;
    }

    const nextDelayMs = await planNextStepDelay();

    if (isStaleRun(getActiveRunEpoch())) {
      return;
    }

    if (nextDelayMs < 0) {
      return;
    }

    scheduleNextStep(nextDelayMs, () => {
      advanceStepEpoch();
    });
  }

  return { beginRun, queueNextStep };
}
