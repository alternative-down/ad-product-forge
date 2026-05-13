// =============================================================================
// Run epoch state management
// Tracks active run/step/generate epochs to detect stale runs.
// =============================================================================

export interface RunEpochState {
  activeRunEpoch: number;
  activeStepEpoch: number;
  activeGenerateToken: number;
  activeRunId: string | null;
}

export function createRunEpochState(): RunEpochState {
  return {
    activeRunEpoch: 0,
    activeStepEpoch: 0,
    activeGenerateToken: 0,
    activeRunId: null,
  };
}

/** Advances the run epoch, resetting step and generate counters. */
export function advanceRunEpoch(state: RunEpochState): number {
  state.activeRunEpoch += 1;
  state.activeStepEpoch = 0;
  state.activeGenerateToken = 0;
  state.activeRunId = null;
  return state.activeRunEpoch;
}

/** Returns true if the given runEpoch is older than the current active run. */
export function isStaleRun(state: RunEpochState, runEpoch: number): boolean {
  return runEpoch !== state.activeRunEpoch;
}

/** Advances the step epoch and resets the generate token. */
export function advanceStepEpoch(state: RunEpochState): number {
  state.activeStepEpoch += 1;
  state.activeGenerateToken = 0;
  return state.activeStepEpoch;
}

/** Advances the generate token counter. */
export function advanceGenerateToken(state: RunEpochState): number {
  state.activeGenerateToken += 1;
  return state.activeGenerateToken;
}

// =============================================================================
// Backoff state management
// =============================================================================

export interface BackoffState {
  backoffMs: number;
  instant: boolean;
  nextStepAt: number | null;
}

export function createBackoffState(): BackoffState {
  return {
    backoffMs: 60_000,
    instant: false,
    nextStepAt: null,
  };
}

/** Doubles backoff, capped at 5 minutes. */
export function nextBackoff(state: BackoffState): number {
  state.backoffMs = Math.min(state.backoffMs * 2, 300_000);
  return state.backoffMs;
}

/** Resets backoff to default. */
export function resetBackoff(state: BackoffState): void {
  state.backoffMs = 60_000;
  state.instant = false;
}

/**
 * Calculates the delay in ms before the next step.
 * Returns 0 if no delay is needed.
 */
export function calculateDelayMs(
  state: BackoffState,
  options: {
    hasPendingMessages: boolean;
    stopRequested: boolean;
    hasNewEvents: boolean;
  },
): number {
  if (options.stopRequested || !options.hasPendingMessages) {
    state.nextStepAt = null;
    return 0;
  }
  if (options.hasNewEvents) {
    state.nextStepAt = Date.now();
    return 0;
  }
  if (state.nextStepAt === null) {
    state.nextStepAt = Date.now() + state.backoffMs;
  }
  const delay = state.nextStepAt - Date.now();
  return Math.max(0, delay);
}

// =============================================================================
// Step progress tracking
// =============================================================================

export interface ProgressState {
  lastStepStartedAt: number | null;
  lastStepStage: string | null;
}

export function createProgressState(): ProgressState {
  return {
    lastStepStartedAt: null,
    lastStepStage: null,
  };
}