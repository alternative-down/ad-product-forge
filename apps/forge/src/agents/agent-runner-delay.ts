/**
 * Step-delay calculation helpers.
 *
 * Extracted from agent-runner.ts to enable independent unit testing.
 *
 * `calculateBudgetDelayMs` — budget-aware delay before the next step.
 *   Given contract expiry, remaining budget, and estimated step cost,
 *   computes the delay so the remaining budget is evenly spread across
 *   the remaining time window.
 *
 * `nextExponentialBackoffMs` — simple exponential backoff, capped at a max.
 */
import { TEN_MINUTES_MS } from './time-constants';

/**
 * Computes the delay (ms) before the next step based on contract budget.
 *
 * Evenly distributes the remaining budget across the remaining time so that
 * the agent can afford `stepsPossible` steps before `endsAt`.
 *
 * @param endsAt            — contract end timestamp (ms, from Date.now())
 * @param remainingBudgetUsd — contract remaining budget (USD)
 * @param estimatedStepUsd   — estimated cost of one step (USD), or null if unknown
 * @returns delay in ms (0 if no delay is needed)
 */
export function calculateBudgetDelayMs(
  endsAt: number,
  remainingBudgetUsd: number,
  estimatedStepUsd: number | null,
  now: () => number = () => Date.now(),
): number {
  if (estimatedStepUsd === null || estimatedStepUsd <= 0) {
    return 0;
  }

  const remainingTimeMs = endsAt - now();
  const stepsPossible = remainingBudgetUsd / estimatedStepUsd;

  if (remainingTimeMs <= 0 || stepsPossible <= 0) {
    return 0;
  }

  return remainingTimeMs / stepsPossible;
}

/**
 * Returns the current backoff delay and doubles it for the next attempt.
 *
 * Unlike `nextBackoff` in `agent-runner-state.ts` (which operates on a BackoffState
 * struct), this function accepts the *current* backoff value directly and
 * returns both the value to use now and the new value for next time.
 *
 * @param currentBackoffMs — current backoff value in ms
 * @returns { current: ms to wait now, next: ms for the following backoff }
 */
export function nextExponentialBackoffMs(currentBackoffMs: number): {
  current: number;
  next: number;
} {
  const next = Math.min(currentBackoffMs * 2, TEN_MINUTES_MS);
  return { current: currentBackoffMs, next };
}