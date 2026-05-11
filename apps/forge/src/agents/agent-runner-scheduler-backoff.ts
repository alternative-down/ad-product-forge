/**
 * Backoff + budget-aware delay calculation for the agent scheduler.
 *
 * All functions are pure — no I/O, no shared mutable state. They operate on
 * a `BackoffState` object passed as the first parameter (or closed over in
 * the `buildBackoffDeps` factory below).
 *
 * The factory pattern mirrors `agent-runner-delay.ts`:
 * callers pass their mutable state slice; this module reads/writes it directly.
 */
import { ONE_MINUTE_MS, TEN_MINUTES_MS } from './time-constants';

/** Mutable backoff state owned by the scheduler. */
export type BackoffState = {
  backoffMs: number;
  instant: boolean;
};

/**
 * Returns the current backoff delay and doubles the stored value (capped at TEN_MINUTES_MS).
 * Returns the delay *before* doubling — callers use it immediately and let the state
 * reflect the next delay.
 */
export function nextBackoff(state: BackoffState): number {
  const delayMs = state.backoffMs;
  state.backoffMs = Math.min(state.backoffMs * 2, TEN_MINUTES_MS);
  return delayMs;
}

/** Resets the backoff timer to the initial ONE_MINUTE_MS interval. */
export function resetBackoff(state: BackoffState): void {
  state.backoffMs = ONE_MINUTE_MS;
}

/** Sets the "instant" flag — when true, planNextStepDelay returns 0 (no delay). */
export function setInstant(state: BackoffState, value: boolean): void {
  state.instant = value;
}

/**
 * Calculates the millisecond delay before the next step, based on contract
 * budget and time remaining.
 *
 * Returns 0 when:
 *   - estimatedStepUsd is null or ≤ 0 (can't estimate cost)
 *   - remaining budget or time is exhausted
 * Otherwise: remainingTimeMs / stepsPossible
 */
export function calculateDelayMs(
  endsAt: number,
  remainingBudgetUsd: number,
  estimatedStepUsd: number | null,
): number {
  if (estimatedStepUsd === null || estimatedStepUsd <= 0) {
    return 0;
  }

  const remainingTimeMs = endsAt - Date.now();
  const stepsPossible = remainingBudgetUsd / estimatedStepUsd;

  if (remainingTimeMs <= 0 || stepsPossible <= 0) {
    return 0;
  }

  return remainingTimeMs / stepsPossible;
}