export type OperationalMemoryBudgetLimits = {
  totalContextTokens: number;
  recentRawTokens: number;
  rawObservationBatchTokens: number;
  observationReflectionBatchTokens: number;
};

export function calculateOperationalMemoryReflectionBudget(
  limits: OperationalMemoryBudgetLimits,
): number {
  const remainingTokens =
    limits.totalContextTokens -
    limits.recentRawTokens -
    limits.rawObservationBatchTokens -
    limits.observationReflectionBatchTokens;

  return Math.max(limits.observationReflectionBatchTokens, remainingTokens);
}
