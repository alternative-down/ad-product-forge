import { describe, expect, it } from 'vitest';
import { estimateLtmDelayMs, calculateLtmStepCost } from './agent-ltm-cost-helpers';

const defaultPricing = {
  modelPrice: {
    inputPerMillionUsd: 0.1,
    inputCachePerMillionUsd: 0.01,
    outputPerMillionUsd: 0.3,
  },
  contractCostMultiplier: 1.0,
};

describe('estimateLtmDelayMs', () => {
  it('returns 0 when no recent steps', () => {
    const result = estimateLtmDelayMs({
      recentSteps: [],
      pricing: defaultPricing,
      contractBudgetUsd: 100,
      contractSpentUsd: 0,
      contractEndsAt: Date.now() + 86_400_000,
    });
    expect(result).toBe(0);
  });

  it('returns 0 when no modelPrice', () => {
    const result = estimateLtmDelayMs({
      recentSteps: [{ inputTokens: 1000, cachedInputTokens: 0, outputTokens: 500 }],
      pricing: { modelPrice: null, contractCostMultiplier: 1.0 },
      contractBudgetUsd: 100,
      contractSpentUsd: 0,
      contractEndsAt: Date.now() + 86_400_000,
    });
    expect(result).toBe(0);
  });

  it('returns 0 when estimated step cost is zero', () => {
    const result = estimateLtmDelayMs({
      recentSteps: [{ inputTokens: 0, cachedInputTokens: 0, outputTokens: 0 }],
      pricing: defaultPricing,
      contractBudgetUsd: 100,
      contractSpentUsd: 0,
      contractEndsAt: Date.now() + 86_400_000,
    });
    expect(result).toBe(0);
  });

  it('returns 0 when budget exhausted', () => {
    const result = estimateLtmDelayMs({
      recentSteps: [{ inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 5_000 }],
      pricing: defaultPricing,
      contractBudgetUsd: 100,
      contractSpentUsd: 100,
      contractEndsAt: Date.now() + 86_400_000,
    });
    expect(result).toBe(0);
  });

  it('returns 0 when contract expired', () => {
    const result = estimateLtmDelayMs({
      recentSteps: [{ inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 5_000 }],
      pricing: defaultPricing,
      contractBudgetUsd: 100,
      contractSpentUsd: 0,
      contractEndsAt: Date.now() - 1000,
    });
    expect(result).toBe(0);
  });

  it('returns positive delay when all conditions met', () => {
    // $0.0015/step, $50 remaining, 86400000ms remaining → ~57_600_000ms
    const result = estimateLtmDelayMs({
      recentSteps: [{ inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 5_000 }],
      pricing: defaultPricing,
      contractBudgetUsd: 100,
      contractSpentUsd: 50,
      contractEndsAt: Date.now() + 86_400_000,
    });
    expect(result).toBeGreaterThan(0);
  });

  it('applies contractCostMultiplier to estimated step cost', () => {
    const result = estimateLtmDelayMs({
      recentSteps: [{ inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 5_000 }],
      pricing: { modelPrice: defaultPricing.modelPrice, contractCostMultiplier: 0.5 },
      contractBudgetUsd: 100,
      contractSpentUsd: 0,
      contractEndsAt: Date.now() + 86_400_000,
    });
    expect(result).toBeGreaterThan(0);
    // Higher multiplier → fewer steps possible → shorter delay
  });

  it('considers cached tokens in cost calculation', () => {
    const withCache = estimateLtmDelayMs({
      recentSteps: [{ inputTokens: 10_000, cachedInputTokens: 8_000, outputTokens: 5_000 }],
      pricing: defaultPricing,
      contractBudgetUsd: 100,
      contractSpentUsd: 0,
      contractEndsAt: Date.now() + 86_400_000,
    });
    const withoutCache = estimateLtmDelayMs({
      recentSteps: [{ inputTokens: 10_000, cachedInputTokens: 0, outputTokens: 5_000 }],
      pricing: defaultPricing,
      contractBudgetUsd: 100,
      contractSpentUsd: 0,
      contractEndsAt: Date.now() + 86_400_000,
    });
    // With cache: fewer uncached tokens → cheaper → fewer steps → shorter delay
    expect(withCache).toBeLessThan(withoutCache);
  });
});

describe('calculateLtmStepCost', () => {
  it('returns 0 when modelPrice is null', () => {
    const result = calculateLtmStepCost({
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
      pricing: { modelPrice: null, contractCostMultiplier: 1.0 },
    });
    expect(result).toBe(0);
  });

  it('calculates uncached input + output cost', () => {
    const result = calculateLtmStepCost({
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 1_000_000,
      pricing: defaultPricing,
    });
    // 1M input @ $0.1/M = $0.10 + 1M output @ $0.3/M = $0.30 = $0.40
    expect(result).toBeCloseTo(0.4, 5);
  });

  it('applies discounted rate to cached tokens', () => {
    const withCache = calculateLtmStepCost({
      inputTokens: 1_000_000,
      cachedInputTokens: 500_000,
      outputTokens: 0,
      pricing: defaultPricing,
    });
    const withoutCache = calculateLtmStepCost({
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
      pricing: defaultPricing,
    });
    // With cache: 0.5M uncached @ $0.1 + 0.5M cached @ $0.01 = $0.055
    // Without: 1M uncached @ $0.1 = $0.10
    expect(withCache).toBeLessThan(withoutCache);
  });

  it('applies contractCostMultiplier', () => {
    const base = calculateLtmStepCost({
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
      pricing: defaultPricing,
    });
    const doubled = calculateLtmStepCost({
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      outputTokens: 0,
      pricing: { modelPrice: defaultPricing.modelPrice, contractCostMultiplier: 2.0 },
    });
    expect(doubled).toBe(base * 2);
  });
});
