/**
 * Unit tests for agent-runner-delay.ts.
 *
 * Tests pure exported functions:
 * - calculateBudgetDelayMs
 * - nextExponentialBackoffMs
 */
import { describe, expect, it } from 'vitest';
import { calculateBudgetDelayMs, nextExponentialBackoffMs } from './agent-runner-delay';

// ─── Tests: calculateBudgetDelayMs ────────────────────────────────────────────

describe('calculateBudgetDelayMs', () => {
  const FIXED_NOW = 1735689600000; // 2025-01-01T00:00:00.000Z
  const now = () => FIXED_NOW;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 0 when estimatedStepUsd is null', () => {
    const endsAt = now() + 3_600_000;
    expect(calculateBudgetDelayMs(endsAt, 10, null, now)).toBe(0);
  });

  it('returns 0 when estimatedStepUsd is 0', () => {
    const endsAt = now() + 3_600_000;
    expect(calculateBudgetDelayMs(endsAt, 10, 0, now)).toBe(0);
  });

  it('returns 0 when estimatedStepUsd is negative', () => {
    const endsAt = now() + 3_600_000;
    expect(calculateBudgetDelayMs(endsAt, 10, -1, now)).toBe(0);
  });

  it('returns 0 when contract has expired (endsAt in past)', () => {
    const endsAt = now() - 1000;
    expect(calculateBudgetDelayMs(endsAt, 10, 1, now)).toBe(0);
  });

  it('returns 0 when remainingBudgetUsd is 0', () => {
    const endsAt = now() + 3_600_000;
    expect(calculateBudgetDelayMs(endsAt, 0, 1, now)).toBe(0);
  });

  it('returns 0 when remainingBudgetUsd is negative', () => {
    const endsAt = now() + 3_600_000;
    expect(calculateBudgetDelayMs(endsAt, -5, 1, now)).toBe(0);
  });

  it('returns 0 when no steps possible (budget exhausted before expiry)', () => {
    const endsAt = now() + 3_600_000;
    // remainingBudget=0 → stepsPossible=0/1=0 → 0
    expect(calculateBudgetDelayMs(endsAt, 0, 1, now)).toBe(0);
  });

  it('evenly distributes remaining time across remaining budget', () => {
    // 1 hour remaining, $10 budget, $1/step → 10 steps possible → 360s/step
    const endsAt = now() + 3_600_000;
    expect(calculateBudgetDelayMs(endsAt, 10, 1, now)).toBe(360_000);
  });

  it('handles fractional step costs', () => {
    // 1 hour, $6 budget, $0.50/step → 12 steps possible → 300s/step
    const endsAt = now() + 3_600_000;
    expect(calculateBudgetDelayMs(endsAt, 6, 0.5, now)).toBe(300_000);
  });

  it('handles very small step costs', () => {
    // 1 hour, $1 budget, $0.0001/step → 10000 steps possible → 0.36s/step
    const endsAt = now() + 3_600_000;
    expect(calculateBudgetDelayMs(endsAt, 1, 0.0001, now)).toBe(360);
  });

  it('handles very short remaining time', () => {
    // 1 second, $10 budget, $1/step → 10 steps possible → 100ms/step
    const endsAt = now() + 1_000;
    expect(calculateBudgetDelayMs(endsAt, 10, 1, now)).toBe(100);
  });

  it('handles very large remaining time', () => {
    // 30 days, $10 budget, $1/step → 10 steps → 259200s/step
    const endsAt = now() + 30 * 24 * 3600 * 1000;
    expect(calculateBudgetDelayMs(endsAt, 10, 1, now)).toBe(259_200_000);
  });

  it('handles long remaining time with small budget', () => {
    // 1 hour, $0.01 budget, $0.001/step → 10 steps possible → 360s/step
    const endsAt = now() + 3_600_000;
    expect(calculateBudgetDelayMs(endsAt, 0.01, 0.001, now)).toBe(360_000);
  });
});

// ─── Tests: nextExponentialBackoffMs ───────────────────────────────────────────

describe('nextExponentialBackoffMs', () => {
  it('returns current value and doubles it', () => {
    const result = nextExponentialBackoffMs(60_000);
    expect(result.current).toBe(60_000);
    expect(result.next).toBe(120_000);
  });

  it('caps doubling at TEN_MINUTES_MS (600_000 ms)', () => {
    // Start above cap → next should be capped, current should be as-is
    const result = nextExponentialBackoffMs(700_000);
    expect(result.current).toBe(700_000);
    expect(result.next).toBe(600_000);
  });

  it('handles zero backoff', () => {
    const result = nextExponentialBackoffMs(0);
    expect(result.current).toBe(0);
    expect(result.next).toBe(0);
  });

  it('handles very small backoff', () => {
    const result = nextExponentialBackoffMs(1_000);
    expect(result.current).toBe(1_000);
    expect(result.next).toBe(2_000);
  });

  it('caps at exactly TEN_MINUTES_MS', () => {
    const result = nextExponentialBackoffMs(300_000);
    expect(result.current).toBe(300_000);
    expect(result.next).toBe(600_000);
  });

  it('stops doubling once at cap', () => {
    // Apply next twice from 150s → 300s → 600s (cap)
    const step1 = nextExponentialBackoffMs(150_000);
    expect(step1.next).toBe(300_000);
    const step2 = nextExponentialBackoffMs(step1.next);
    expect(step2.next).toBe(600_000);
    const step3 = nextExponentialBackoffMs(step2.next);
    expect(step3.next).toBe(600_000); // stays at cap
    expect(step3.current).toBe(600_000);
  });

  it('allows chained calls for backoff sequence', () => {
    // Simulate backoff doubling: 60s → 120s → 240s → 480s → cap 600s
    const results = [60_000];
    let current = 60_000;
    for (let i = 0; i < 4; i++) {
      const r = nextExponentialBackoffMs(current);
      results.push(r.next);
      current = r.next;
    }
    expect(results).toEqual([60_000, 120_000, 240_000, 480_000, 600_000]);
  });
});