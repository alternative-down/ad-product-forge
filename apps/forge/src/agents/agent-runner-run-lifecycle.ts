/**
 * agent-runner-run-lifecycle.ts
 *
 * Manages run epoch tracking, stale-run detection, and generate token lifecycle.
 * Extracted from agent-runner-scheduler.ts (#2257).
 */
import { type SchedulerState } from './agent-runner-scheduler';

export type RunLifecycle = {
  startNewRunEpoch(): number;
  isStaleRun(runEpoch: number): boolean;
  invalidateInFlightGenerate(): void;
  startGenerateAttempt(controller: AbortController): number;
  finishGenerateAttempt(generateToken: number, controller: AbortController): void;
  getGenerateToken(): number;
  advanceGenerateToken(): void;
  getAbortController(): AbortController | null;
};

export type RunLifecycleDeps = {
  stopped: boolean;
};

export function createRunLifecycle(
  state: SchedulerState,
  deps: RunLifecycleDeps,
): RunLifecycle {
  let currentGenerateAbortController: AbortController | null = null;

  function startNewRunEpoch(): number {
    state.activeRunEpoch += 1;
    state.activeStepEpoch = 0;
    invalidateInFlightGenerate();
    return state.activeRunEpoch;
  }

  function isStaleRun(runEpoch: number): boolean {
    return deps.stopped || runEpoch !== state.activeRunEpoch;
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

  function advanceGenerateToken(): void {
    // Invalidate any in-flight generate, then start a fresh attempt.
    // The new token is discarded — this mirrors the original behavior.
    invalidateInFlightGenerate();
    startGenerateAttempt(new AbortController());
  }

  return {
    startNewRunEpoch,
    isStaleRun,
    invalidateInFlightGenerate,
    startGenerateAttempt,
    finishGenerateAttempt,
    getGenerateToken,
    getAbortController: () => currentGenerateAbortController,
    advanceGenerateToken,
  };
}