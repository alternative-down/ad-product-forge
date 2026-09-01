/**
 * Attempt Lifecycle — extracted from agent-runner-generate.ts (#2654)
 *
 * Manages the lifecycle of a single generate attempt within the
 * generateWithTimeoutRetries loop: starting a token, finishing
 * (clearing abort controller), and invalidating in-flight attempts.
 *
 * All functions operate on GenerateDeps.epochState and the abort
 * controller — no coupling to the generation logic itself.
 */

import type { GenerateDeps } from './agent-runner-generate';
import { advanceGenerateToken } from './agent-runner-state';

/**
 * Starts a new generate attempt, advances the token, and registers
 * the abort controller so it can be cleared on completion or timeout.
 */
export function startGenerateAttempt(deps: GenerateDeps, controller: AbortController): number {
  advanceGenerateToken(deps.epochState);
  deps.setCurrentGenerateAbortController(controller);
  return deps.epochState.activeGenerateToken;
}

/**
 * Finishes the current attempt only if the token matches — meaning no
 * subsequent attempt has started in the meantime. Clears the abort
 * controller and aborts the signal so the generate call unwinds.
 */
export function finishGenerateAttempt(
  generateToken: number,
  controller: AbortController,
  deps: GenerateDeps,
) {
  if (deps.epochState.activeGenerateToken === generateToken) {
    deps.setCurrentGenerateAbortController(null);
  }
  controller.abort();
}

/**
 * Invalidates any in-flight generate call by advancing the token and
 * aborting the current abort controller. Used when the run is stopped
 * or superseded before a generate call completes.
 */
export function invalidateInFlightGenerate(deps: GenerateDeps) {
  advanceGenerateToken(deps.epochState);
  deps.currentGenerateAbortController?.abort(new Error('Agent generate invalidated'));
  deps.setCurrentGenerateAbortController(null);
}
