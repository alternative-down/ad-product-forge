// =============================================================================
// Timeout management for agent-runner-generate.ts
// Extracted from agent-runner-generate.ts (#2258)
// Manages the generate loop timeout: creates guard handle, touches timer on
// iteration progress, and clears on completion.
// =============================================================================

import { FIFTEEN_MINUTES_MS } from './time-constants';

export { FIFTEEN_MINUTES_MS } from './time-constants';

const GENERATE_TIMEOUT_MS = FIFTEEN_MINUTES_MS;

export interface GenerateTimeoutHandle {
  promise: Promise<never>;
  timeoutId: NodeJS.Timeout | null;
  readonly rejectTimeout: ((error: Error) => void) | null;
}

/**
 * Creates a timeout guard that will abort the controller if no iteration
 * progress is made within GENERATE_TIMEOUT_MS (15 minutes).
 * Returns a handle with the timeout promise and a settable timeoutId.
 */
export function createGenerateTimeoutGuard(_controller: AbortController): GenerateTimeoutHandle {
  let timeoutId: NodeJS.Timeout | null = null;
  let rejectTimeout: ((error: Error) => void) | null = null;
  const promise = new Promise<never>((_, reject) => {
    rejectTimeout = reject;
  });

  return {
    promise,
    get timeoutId() {
      return timeoutId;
    },
    set timeoutId(value: NodeJS.Timeout | null) {
      timeoutId = value;
    },
    rejectTimeout,
  };
}

export interface ProgressState {
  lastStepStartedAt: number | null;
  lastStepStage: string | null;
  lastGenerateProgress: {
    stage: string;
    at: number;
    detail: Record<string, unknown> | null;
  } | null;
}

/**
 * Touches (resets) the generate timeout timer. Called on each iteration
 * progress. If the timer fires, aborts the controller and rejects the
 * timeout promise.
 */
export function touchGenerateTimeout(
  timeout: GenerateTimeoutHandle,
  controller: AbortController,
  lastStepStage: string | null,
  lastGenerateProgress: ProgressState['lastGenerateProgress'],
) {
  if (timeout.timeoutId) {
    clearTimeout(timeout.timeoutId);
  }

  timeout.timeoutId = setTimeout(() => {
    const timeoutError = new Error(
      `Agent generate timed out after ${GENERATE_TIMEOUT_MS}ms without iteration progress`,
    );
    (timeoutError as Error & { context?: Record<string, unknown> }).context = {
      lastStepStage,
      lastGenerateProgress,
    };
    controller.abort(timeoutError);
    timeout.rejectTimeout?.(timeoutError);
  }, GENERATE_TIMEOUT_MS);
}

/** Clears the generate timeout timer if it is set. */
export function clearGenerateTimeout(timeout: GenerateTimeoutHandle) {
  if (!timeout.timeoutId) {
    return;
  }
  clearTimeout(timeout.timeoutId);
  timeout.timeoutId = null;
}