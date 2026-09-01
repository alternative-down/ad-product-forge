import { describe, it, expect } from 'vitest';
import {
  nextBackoff,
  resetBackoff,
  setInstant,
  calculateDelayMs,
  type BackoffState,
} from './agent-runner-scheduler-backoff';

describe('agent-runner-scheduler-backoff', () => {
  // ── BackoffState fixtures ───────────────────────────────────────────────────
  const DEFAULT_STATE = (): BackoffState => ({
    backoffMs: 60_000,
    instant: false,
  });

  // ── nextBackoff ────────────────────────────────────────────────────────────
  describe('nextBackoff', () => {
    it('returns the current delay before doubling', () => {
      const state = DEFAULT_STATE();
      expect(nextBackoff(state)).toBe(60_000);
    });

    it('doubles the stored backoffMs', () => {
      const state = DEFAULT_STATE();
      nextBackoff(state);
      expect(state.backoffMs).toBe(120_000);
    });

    it('doubles exponentially', () => {
      const state: BackoffState = { backoffMs: 60_000, instant: false };
      nextBackoff(state); // 60k → 120k
      nextBackoff(state); // 120k → 240k
      expect(state.backoffMs).toBe(240_000);
    });

    it('caps backoff at TEN_MINUTES_MS (10 min)', () => {
      const state: BackoffState = { backoffMs: 600_000, instant: false };
      const returned = nextBackoff(state);
      expect(returned).toBe(600_000);
      // Doubling would be 1.2M; cap at 600k
      expect(state.backoffMs).toBe(600_000);
    });

    it('caps at exactly TEN_MINUTES_MS', () => {
      const state: BackoffState = { backoffMs: 300_000, instant: false };
      nextBackoff(state); // 300k → 600k (exact cap)
      expect(state.backoffMs).toBe(600_000);
      nextBackoff(state); // 600k → 600k (already at cap, stays 600k)
      expect(state.backoffMs).toBe(600_000);
    });

    it('returns the delay BEFORE doubling', () => {
      const state: BackoffState = { backoffMs: 120_000, instant: false };
      const returned = nextBackoff(state);
      expect(returned).toBe(120_000);
      expect(state.backoffMs).toBe(240_000); // doubled
    });
  });

  // ── resetBackoff ─────────────────────────────────────────────────────────────
  describe('resetBackoff', () => {
    it('resets backoffMs to ONE_MINUTE_MS (60s)', () => {
      const state: BackoffState = { backoffMs: 240_000, instant: false };
      resetBackoff(state);
      expect(state.backoffMs).toBe(60_000);
    });

    it('does not affect the instant flag', () => {
      const state: BackoffState = { backoffMs: 240_000, instant: true };
      resetBackoff(state);
      expect(state.instant).toBe(true);
      expect(state.backoffMs).toBe(60_000);
    });

    it('is safe to call multiple times', () => {
      const state = DEFAULT_STATE();
      resetBackoff(state);
      resetBackoff(state);
      resetBackoff(state);
      expect(state.backoffMs).toBe(60_000);
    });
  });

  // ── setInstant ──────────────────────────────────────────────────────────────
  describe('setInstant', () => {
    it('sets the instant flag to true', () => {
      const state = DEFAULT_STATE();
      setInstant(state, true);
      expect(state.instant).toBe(true);
    });

    it('sets the instant flag to false', () => {
      const state: BackoffState = { backoffMs: 60_000, instant: true };
      setInstant(state, false);
      expect(state.instant).toBe(false);
    });

    it('does not affect backoffMs', () => {
      const state: BackoffState = { backoffMs: 120_000, instant: false };
      setInstant(state, true);
      expect(state.backoffMs).toBe(120_000);
    });
  });

  // ── calculateDelayMs ────────────────────────────────────────────────────────
  describe('calculateDelayMs', () => {
    const ONE_HOUR_MS = 3_600_000;

    it('returns 0 when estimatedStepUsd is null', () => {
      const delay = calculateDelayMs(Date.now() + ONE_HOUR_MS, 100, null);
      expect(delay).toBe(0);
    });

    it('returns 0 when estimatedStepUsd is 0', () => {
      const delay = calculateDelayMs(Date.now() + ONE_HOUR_MS, 100, 0);
      expect(delay).toBe(0);
    });

    it('returns 0 when estimatedStepUsd is negative', () => {
      const delay = calculateDelayMs(Date.now() + ONE_HOUR_MS, 100, -5);
      expect(delay).toBe(0);
    });

    it('returns 0 when remainingBudgetUsd is 0', () => {
      const delay = calculateDelayMs(Date.now() + ONE_HOUR_MS, 0, 10);
      expect(delay).toBe(0);
    });

    it('returns 0 when remainingTimeMs is 0 (contract expired)', () => {
      const delay = calculateDelayMs(Date.now(), 100, 10);
      expect(delay).toBe(0);
    });

    it('returns 0 when remainingTimeMs is negative (contract expired)', () => {
      const delay = calculateDelayMs(Date.now() - 10_000, 100, 10);
      expect(delay).toBe(0);
    });

    it('returns 0 when stepsPossible is 0', () => {
      const delay = calculateDelayMs(Date.now() + ONE_HOUR_MS, 0, 10);
      expect(delay).toBe(0);
    });

    it('returns correct delay for a healthy contract', () => {
      // Contract ends in 1h, budget for 100 steps at $1/step, estimate $1/step
      const endsAt = Date.now() + ONE_HOUR_MS;
      const delay = calculateDelayMs(endsAt, 100, 1);
      // remainingTimeMs = 1h, stepsPossible = 100 → delay = 1h / 100 = 36s
      expect(delay).toBeCloseTo(36_000, 0);
    });

    it('scales linearly with remaining budget', () => {
      const endsAt = Date.now() + ONE_HOUR_MS;
      const delay = calculateDelayMs(endsAt, 50, 1);
      // half the budget → double the delay
      expect(delay).toBeCloseTo(72_000, 0);
    });

    it('scales linearly with remaining time', () => {
      const endsAt = Date.now() + 3_600_000; // 1h
      const delay1 = calculateDelayMs(endsAt, 100, 1);
      const endsAt2 = Date.now() + 1_800_000; // 30min
      const delay2 = calculateDelayMs(endsAt2, 100, 1);
      // half the time → half the delay
      expect(delay2).toBeCloseTo(delay1 / 2, 0);
    });

    it('handles very small remaining budget correctly', () => {
      const endsAt = Date.now() + ONE_HOUR_MS;
      const delay = calculateDelayMs(endsAt, 0.001, 1);
      // $0.001 budget at $1/step = 0.001 steps possible
      // remainingTimeMs (1h) / 0.001 = 3.6 billion ms
      expect(delay).toBeGreaterThan(1_000_000_000);
    });

    it('handles very large budget correctly', () => {
      const endsAt = Date.now() + ONE_HOUR_MS;
      const delay = calculateDelayMs(endsAt, 1_000_000, 1);
      // $1M budget at $1/step = 1M steps possible → 1h / 1M = 3.6ms
      expect(delay).toBeCloseTo(3.6, 1);
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────────
  describe('nextBackoff + resetBackoff integration', () => {
    it('resetBackoff restores the initial state so nextBackoff returns 60s again', () => {
      const state: BackoffState = { backoffMs: 240_000, instant: false };
      nextBackoff(state); // 240k → 480k
      expect(state.backoffMs).toBe(480_000);

      resetBackoff(state); // back to 60k
      const delay = nextBackoff(state); // 60k → 120k, returns 60k
      expect(delay).toBe(60_000);
      expect(state.backoffMs).toBe(120_000);
    });
  });

  describe('instant flag + calculateDelayMs', () => {
    it('instant flag is in BackoffState but calculateDelayMs ignores it', () => {
      // calculateDelayMs is pure arithmetic; the instant flag is checked
      // by the caller (planNextStepDelay) before calling calculateDelayMs
      const endsAt = Date.now() + 3_600_000;
      const delay = calculateDelayMs(endsAt, 100, 1);
      // instant flag doesn't affect calculateDelayMs output
      expect(delay).toBeCloseTo(36_000, 0);
    });
  });
});
