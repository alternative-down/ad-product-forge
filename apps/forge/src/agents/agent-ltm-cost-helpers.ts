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
export function estimateLtmDelayMs(params: {
  recentSteps: RecentLtmStep[];
  pricing: LtmPricingInfo;
  contractBudgetUsd: number;
  contractSpentUsd: number;
  contractEndsAt: number;
}): number {
  const { recentSteps, pricing, contractBudgetUsd, contractSpentUsd, contractEndsAt } = params;

  if (recentSteps.length === 0 || !pricing.modelPrice) {
    return 0;
  }

  const avgInput = recentSteps.reduce((t, s) => t + s.inputTokens, 0) / recentSteps.length;
  const avgCached = recentSteps.reduce((t, s) => t + s.cachedInputTokens, 0) / recentSteps.length;
  const avgOutput = recentSteps.reduce((t, s) => t + s.outputTokens, 0) / recentSteps.length;
  const avgUncached = Math.max(avgInput - avgCached, 0);

  const estimatedStepUsd =
    ((avgUncached / 1_000_000) * pricing.modelPrice.inputPerMillionUsd
      + (avgCached / 1_000_000) * pricing.modelPrice.inputCachePerMillionUsd
      + (avgOutput / 1_000_000) * pricing.modelPrice.outputPerMillionUsd)
    * pricing.contractCostMultiplier;

  if (estimatedStepUsd <= 0) {
    return 0;
  }

  const remainingBudgetUsd = contractBudgetUsd - contractSpentUsd;
  const remainingTimeMs = contractEndsAt - Date.now();

  if (remainingTimeMs <= 0 || remainingBudgetUsd <= 0) {
    return 0;
  }

  const stepsPossible = remainingBudgetUsd / estimatedStepUsd;
  return Math.max(0, Math.round(remainingTimeMs / stepsPossible));
}

/**
 * Calculates the USD cost of a single LTM step based on token usage and pricing.
 *
 * Returns 0 when modelPrice is null.
 *
 * Pure function — no I/O.
 */
export function calculateLtmStepCost(params: {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  pricing: LtmPricingInfo;
}): number {
  const { inputTokens, cachedInputTokens, outputTokens, pricing } = params;

  if (!pricing.modelPrice) {
    return 0;
  }

  const uncachedInputTokens = Math.max(inputTokens - cachedInputTokens, 0);
  return (
    ((uncachedInputTokens / 1_000_000) * pricing.modelPrice.inputPerMillionUsd
      + (cachedInputTokens / 1_000_000) * pricing.modelPrice.inputCachePerMillionUsd
      + (outputTokens / 1_000_000) * pricing.modelPrice.outputPerMillionUsd)
    * pricing.contractCostMultiplier
  );
}