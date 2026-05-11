/**
 * Run / step / generation epoch tracking for the agent scheduler.
 *
 * Functions operate on `state` (which must include activeRunEpoch, activeStepEpoch,
 * activeGenerateToken) and `genCtrl` (which holds currentAbortController).
 *
 * epoch functions are pure with respect to their inputs — they only write to
 * the objects passed as parameters. Callers control what gets synchronized.
 */
export type EpochState = {
  activeRunEpoch: number;
  activeStepEpoch: number;
  activeGenerateToken: number;
};

export type GenControllerState = {
  currentAbortController: AbortController | null;
};

// ── Run / step epoch ─────────────────────────────────────────────────────────

/** Increments `activeRunEpoch`, resets `activeStepEpoch` to 0. */
export function startNewRunEpoch(state: EpochState): number {
  state.activeRunEpoch += 1;
  state.activeStepEpoch = 0;
  return state.activeRunEpoch;
}

/** Returns true when `runEpoch` does not match the current `activeRunEpoch`. */
export function isStaleRun(state: EpochState, stopped: boolean, runEpoch: number): boolean {
  return stopped || runEpoch !== state.activeRunEpoch;
}

/** Increments `activeStepEpoch`. */
export function advanceStepEpoch(state: EpochState): number {
  state.activeStepEpoch += 1;
  return state.activeStepEpoch;
}

/** Returns the current generate token. */
export function getGenerateToken(state: EpochState): number {
  return state.activeGenerateToken;
}

// ── Generate token management ─────────────────────────────────────────────────

/**
 * Increments `state.activeGenerateToken`, stores the new AbortController, and
 * returns the new token value.
 */
export function startGenerateAttempt(
  state: EpochState,
  genCtrl: GenControllerState,
  controller: AbortController,
): number {
  state.activeGenerateToken += 1;
  genCtrl.currentAbortController = controller;
  return state.activeGenerateToken;
}

/**
 * Aborts `controller`. If `generateToken` is stale (doesn't match current), returns
 * early without clearing the stored controller. Otherwise clears it.
 */
export function finishGenerateAttempt(
  state: EpochState,
  genCtrl: GenControllerState,
  generateToken: number,
  controller: AbortController,
): void {
  controller.abort();
  if (state.activeGenerateToken !== generateToken) {
    return;
  }
  genCtrl.currentAbortController = null;
}

/**
 * Increments `state.activeGenerateToken`, aborts any in-flight generate with a
 * descriptive Error, and clears the stored controller.
 */
export function invalidateInFlightGenerate(
  state: EpochState,
  genCtrl: GenControllerState,
): void {
  state.activeGenerateToken += 1;
  genCtrl.currentAbortController?.abort(
    new Error('Agent generate invalidated'),
  );
  genCtrl.currentAbortController = null;
}

/** Returns the stored AbortController, if one is active. */
export function getAbortController(genCtrl: GenControllerState): AbortController | null {
  return genCtrl.currentAbortController;
}
