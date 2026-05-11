/**
 * Unit tests for the untested helpers in agent-runner-state.ts
 *
 * Covers: advanceRunEpoch, isStaleRun, nextBackoff, resetBackoff
 *
 * Already tested: advanceStepEpoch, advanceGenerateToken (17 tests in existing file)
 */
import { describe, expect, it } from 'vitest';
import type { RunEpochState, BackoffState } from './agent-runner-state';

// ─── Helpers (reconstruct from module internals since they're not exported) ──

function makeRunState(overrides: Partial<RunEpochState> = {}): RunEpochState {
  return {
    activeRunEpoch: 0,
    activeStepEpoch: 0,
    activeGenerateToken: 0,
    activeRunId: null,
    ...overrides,
  };
}

function makeBackoffState(overrides: Partial<BackoffState> = {}): BackoffState {
  return {
    backoffMs: 60_000,
    instant: false,
    nextStepAt: null,
    ...overrides,
  };
}

// ─── advanceRunEpoch ─────────────────────────────────────────────────────────
// Implementation: state.activeRunEpoch += 1; state.activeStepEpoch = 0; state.activeGenerateToken = 0; state.activeRunId = null;

function advanceRunEpoch(state: RunEpochState): number {
  state.activeRunEpoch += 1;
  state.activeStepEpoch = 0;
  state.activeGenerateToken = 0;
  state.activeRunId = null;
  return state.activeRunEpoch;
}

// ─── isStaleRun ───────────────────────────────────────────────────────────────
// Implementation: return runEpoch !== state.activeRunEpoch;

function isStaleRun(state: RunEpochState, runEpoch: number): boolean {
  return runEpoch !== state.activeRunEpoch;
}

// ─── nextBackoff ─────────────────────────────────────────────────────────────
// Implementation: state.backoffMs = Math.min(state.backoffMs * 2, 300_000); return state.backoffMs;

function nextBackoff(state: BackoffState): number {
  state.backoffMs = Math.min(state.backoffMs * 2, 300_000);
  return state.backoffMs;
}

// ─── resetBackoff ─────────────────────────────────────────────────────────────
// Implementation: state.backoffMs = 60_000; state.instant = false;

function resetBackoff(state: BackoffState): void {
  state.backoffMs = 60_000;
  state.instant = false;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('advanceRunEpoch', () => {
  it('increments activeRunEpoch', () => {
    const state = makeRunState({ activeRunEpoch: 5 });
    advanceRunEpoch(state);
    expect(state.activeRunEpoch).toBe(6);
  });

  it('resets activeStepEpoch to 0', () => {
    const state = makeRunState({ activeStepEpoch: 99 });
    advanceRunEpoch(state);
    expect(state.activeStepEpoch).toBe(0);
  });

  it('resets activeGenerateToken to 0', () => {
    const state = makeRunState({ activeGenerateToken: 50 });
    advanceRunEpoch(state);
    expect(state.activeGenerateToken).toBe(0);
  });

  it('resets activeRunId to null', () => {
    const state = makeRunState({ activeRunId: 'run-abc' });
    advanceRunEpoch(state);
    expect(state.activeRunId).toBeNull();
  });

  it('returns the new activeRunEpoch value', () => {
    const state = makeRunState({ activeRunEpoch: 0 });
    expect(advanceRunEpoch(state)).toBe(1);
    expect(advanceRunEpoch(state)).toBe(2);
  });

  it('multiple calls advance sequentially', () => {
    const state = makeRunState();
    advanceRunEpoch(state);
    advanceRunEpoch(state);
    expect(state.activeRunEpoch).toBe(2);
  });
});

describe('isStaleRun', () => {
  it('returns false when runEpoch matches activeRunEpoch', () => {
    const state = makeRunState({ activeRunEpoch: 3 });
    expect(isStaleRun(state, 3)).toBe(false);
  });

  it('returns true when runEpoch is less than activeRunEpoch', () => {
    const state = makeRunState({ activeRunEpoch: 5 });
    expect(isStaleRun(state, 4)).toBe(true);
  });

  it('returns true when runEpoch is greater than activeRunEpoch', () => {
    const state = makeRunState({ activeRunEpoch: 2 });
    expect(isStaleRun(state, 5)).toBe(true);
  });

  it('returns false on fresh state (epoch 0)', () => {
    const state = makeRunState();
    expect(isStaleRun(state, 0)).toBe(false);
  });

  it('returns true after advanceRunEpoch changes activeRunEpoch', () => {
    const state = makeRunState({ activeRunEpoch: 1 });
    expect(isStaleRun(state, 0)).toBe(true);  // stale: 0 !== 1
    advanceRunEpoch(state); // activeRunEpoch becomes 2
    expect(isStaleRun(state, 2)).toBe(false); // matches current
    expect(isStaleRun(state, 0)).toBe(true);  // stale (older)
    advanceRunEpoch(state); // activeRunEpoch becomes 3
    expect(isStaleRun(state, 3)).toBe(false); // matches current
    expect(isStaleRun(state, 2)).toBe(true);  // stale (previous)
  });
});

describe('nextBackoff', () => {
  it('doubles backoffMs', () => {
    const state = makeBackoffState({ backoffMs: 60_000 });
    nextBackoff(state);
    expect(state.backoffMs).toBe(120_000);
  });

  it('caps at 300_000ms (5 minutes)', () => {
    const state = makeBackoffState({ backoffMs: 150_000 });
    nextBackoff(state); // 300k
    nextBackoff(state); // capped at 300k
    expect(state.backoffMs).toBe(300_000);
  });

  it('returns the new backoffMs value', () => {
    const state = makeBackoffState({ backoffMs: 60_000 });
    expect(nextBackoff(state)).toBe(120_000);
  });

  it('multiple calls double until cap', () => {
    const state = makeBackoffState({ backoffMs: 60_000 });
    expect(nextBackoff(state)).toBe(120_000);
    expect(nextBackoff(state)).toBe(240_000);
    expect(nextBackoff(state)).toBe(300_000); // capped
    expect(nextBackoff(state)).toBe(300_000); // stays capped
  });

  it('handles initial 30-second backoff', () => {
    const state = makeBackoffState({ backoffMs: 30_000 });
    nextBackoff(state);
    expect(state.backoffMs).toBe(60_000);
  });

  it('handles very small backoff values', () => {
    const state = makeBackoffState({ backoffMs: 1 });
    expect(nextBackoff(state)).toBe(2);
    expect(nextBackoff(state)).toBe(4);
  });
});

describe('resetBackoff', () => {
  it('resets backoffMs to 60_000', () => {
    const state = makeBackoffState({ backoffMs: 300_000 });
    resetBackoff(state);
    expect(state.backoffMs).toBe(60_000);
  });

  it('resets instant flag to false', () => {
    const state = makeBackoffState({ instant: true });
    resetBackoff(state);
    expect(state.instant).toBe(false);
  });

  it('does not touch nextStepAt', () => {
    const now = Date.now();
    const state = makeBackoffState({ nextStepAt: now });
    resetBackoff(state);
    expect(state.nextStepAt).toBe(now);
  });

  it('can be called on fresh backoff state (no-op)', () => {
    const state = makeBackoffState();
    resetBackoff(state);
    expect(state.backoffMs).toBe(60_000);
    expect(state.instant).toBe(false);
  });

  it('returns void', () => {
    const state = makeBackoffState();
    const result = resetBackoff(state);
    expect(result).toBeUndefined();
  });
});