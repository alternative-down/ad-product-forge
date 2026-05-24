export interface RecentLtmStep {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface LtmPricingInfo {
  modelPrice: {
    inputPerMillionUsd: number;
    inputCachePerMillionUsd: number;
    outputPerMillionUsd: number;
  } | null;
  contractCostMultiplier: number;
}

/**
 * Estimates the optimal delay (in ms) before the next LTM run based on budget
 * and recent step cost history.
 *
 * Returns 0 when:
 * - No contract, no pricing, or no recent steps
 * - Estimated step cost is zero or negative
 * - Budget is exhausted or contract has expired
 *
 * Pure function — no I/O, no closures, no mutable state.
 */