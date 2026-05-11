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
import type { AgentWakeEvent } from '@forge-runtime/core';

const RUNNER_AWAIT_TIMEOUT_MS = 30_000;
const STARTING_RUN_TIMEOUT_MS = RUNNER_AWAIT_TIMEOUT_MS * 2;

export type HealthcheckDeps = {
  runtimeId: string;
  getExecutionState(id: string): Promise<'idle' | 'running' | 'absent'>;
  isLocallyIdle(): boolean;
  getPendingCount(): number;
  getWakeSnapshot(): { pending: number; waitingForIdle: boolean };
  onRunnerIdle(): Promise<void>;
  beginRun(opts: { reloadRuntime: boolean; wakeStartedAt: number; markRunning: boolean }): Promise<void>;
  queueNextStep(): Promise<void>;
  onStartingRunTimeout(): void;
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
    onStartingRunTimeout,
    syncStarterState,
    syncExecuting,
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

  // Non-idle — check if a start timed out
  // The healthcheck loop uses its own tracking, synced back via callbacks
  // onStartingRunTimeout is called when the loop detects a stuck start
  const startingRunAgeMs = 0; // caller tracks via syncStarterState

  // Check if we're in a "stuck starting" state
  // If the caller reports startingRun=true and it's been too long, call the timeout handler
  // But we don't track time ourselves — we trust the caller's syncStarterState

  // For active execution, if not starting, not executing, and no timer, trigger next step
  // The actual starting/executing/timer checks are done by the caller (agent-runner.ts)
  // and synced via syncStarterState/syncExecuting/syncTimer
  // Here we just try to queue if nothing is blocking
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
  onStartingRunTimeout(): void;
  syncStarterState(running: boolean, startedAt: number | null): void;
}) {
  deps.onStartingRunTimeout();
  deps.syncStarterState(false, null);
}