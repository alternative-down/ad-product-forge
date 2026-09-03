import { describe, expect, it } from 'vitest';

import { calculateOperationalMemoryReflectionBudget } from './operational-memory-budget.js';

describe('calculateOperationalMemoryReflectionBudget', () => {
  it('uses the remaining context capacity when it can hold a complete reflection batch', () => {
    expect(
      calculateOperationalMemoryReflectionBudget({
        totalContextTokens: 50_000,
        recentRawTokens: 10_000,
        rawObservationBatchTokens: 5_000,
        observationReflectionBatchTokens: 5_000,
      }),
    ).toBe(30_000);
  });

  it('reserves at least one complete reflection batch when settings overlap', () => {
    expect(
      calculateOperationalMemoryReflectionBudget({
        totalContextTokens: 50_000,
        recentRawTokens: 60_000,
        rawObservationBatchTokens: 10_000,
        observationReflectionBatchTokens: 5_000,
      }),
    ).toBe(5_000);
  });
});
