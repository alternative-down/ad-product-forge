/**
 * agent-runner-healthcheck.ts
 *
 * Extracted from agent-runner.ts (#1718).
 * Contains the healthcheck logic — periodic state evaluation and run triggering.
 *
 * Exported as a function that receives all dependencies as parameters,
 * keeping agent-runner.ts as the sole source of state truth.
 */
import { withTimeout } from '../utils/async';
import { RUNNER_AWAIT_TIMEOUT_MS } from './agent-runner-generate';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { AgentWakeEvent } from '@forge-runtime/core';

export type HealthcheckDeps = {
  runtimeId: string;
  getExecutionState(id: string): Promise<'idle' | 'running' | 'absent'>;
  isLocallyIdle(): boolean;
  getPendingCount(): number;
  getWakeSnapshot(): {
    pending: number;
    waitingForIdle: boolean;
    firstPendingAt?: number | null;
    nextTriggerAt?: number | null;
    events?: unknown[];
  };
  onRunnerIdle(): Promise<void>;
  beginRun(opts: {
    reloadRuntime: boolean;
    wakeStartedAt: number;
    markRunning: boolean;
  }): Promise<void>;
  queueNextStep(runEpoch?: number): Promise<void>;
  onStartingRunTimeout(runEpoch?: number): void;
  syncStarterState(running: boolean, startedAt: number | null): void;
  syncExecuting(val: boolean): void;
  syncTimer(val: ReturnType<typeof setTimeout> | null): void;
  isStaleRun(runEpoch: number): boolean;
  notifyError(error: unknown): void;
};

/**
 * Standalone healthcheck implementation.
 *
 * Receives all state readers/writers as callback parameters so this module
 * has no internal state — agent-runner.ts remains the sole truth.
 *
 * @see agent-runner.ts for the runner that calls this function.
 */
export async function runHealthcheck(deps: HealthcheckDeps): Promise<void> {
  const {
    runtimeId,
    getExecutionState,
    isLocallyIdle,
    getPendingCount,
    getWakeSnapshot,
    onRunnerIdle,
    beginRun,
    queueNextStep,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onStartingRunTimeout,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    syncStarterState,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    syncExecuting,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    syncTimer,
    notifyError,
  } = deps;

  // Reader callbacks — called each invocation to get current truth
  const executionState = await withTimeout(
    getExecutionState(runtimeId),
    RUNNER_AWAIT_TIMEOUT_MS,
    `Agent execution state lookup timed out for ${runtimeId}`,
  );

  if (executionState === 'idle') {
    if (!isLocallyIdle()) {
      return;
    }

    if (getPendingCount() > 0) {
      await beginRun({
        reloadRuntime: false,
        wakeStartedAt: Date.now(),
        markRunning: true,
      });
      return;
    }

    const wakeSnapshot = getWakeSnapshot();
    if (wakeSnapshot.pending || wakeSnapshot.waitingForIdle) {
      await onRunnerIdle();
    }
    return;
  }

  // Non-idle — for active execution, trigger next step.
  // The caller (agent-runner.ts) handles starting/executing/timer state
  // via syncStarterState/syncExecuting/syncTimer; we just queue if not blocked.
  try {
    await queueNextStep();
  } catch (error) {
    notifyError(error);
  }
}

/**
 * Wrapper that handles the "startingRun timeout" scenario.
 * Call this when you detect the runner is in a starting state for too long.
 */
export function handleStartingRunTimeout(deps: {
  onStartingRunTimeout(runEpoch?: number): void;
  syncStarterState(running: boolean, startedAt: number | null): void;
}) {
  deps.onStartingRunTimeout();
  deps.syncStarterState(false, null);
}
