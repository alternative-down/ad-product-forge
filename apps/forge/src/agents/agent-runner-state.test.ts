/**
 * Unit tests for agents/agent-runner-state.ts.
 * Pure state management: run epochs, backoff, step progress.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import {
  type RunEpochState,
  type BackoffState,
  type ProgressState,
  advanceStepEpoch,
  advanceGenerateToken,
} from './agent-runner-state';

// ─── Factory helpers ─────────────────────────────────────────────────────────

function makeRunEpoch(): RunEpochState {
  return { activeRunEpoch: 0, activeStepEpoch: 0, activeGenerateToken: 0, activeRunId: null };
}

function makeBackoff(): BackoffState {
  return { backoffMs: 60_000, instant: false, nextStepAt: null };
}

function makeProgress(): ProgressState {
  return { lastStepStartedAt: null, lastStepStage: null };
}

// ─── advanceStepEpoch ────────────────────────────────────────────────────────

describe('advanceStepEpoch', () => {
  it('increments activeStepEpoch', () => {
    const state = makeRunEpoch();
    state.activeStepEpoch = 3;

    const result = advanceStepEpoch(state);

    expect(result).toBe(4);
    expect(state.activeStepEpoch).toBe(4);
  });

  it('resets activeGenerateToken to 0', () => {
    const state = makeRunEpoch();
    state.activeGenerateToken = 5;

    advanceStepEpoch(state);

    expect(state.activeGenerateToken).toBe(0);
  });

  it('works from initial state', () => {
    const state = makeRunEpoch();

    const result = advanceStepEpoch(state);

    expect(result).toBe(1);
    expect(state.activeStepEpoch).toBe(1);
  });
});

// ─── advanceGenerateToken ────────────────────────────────────────────────────

describe('advanceGenerateToken', () => {
  it('increments activeGenerateToken', () => {
    const state = makeRunEpoch();
    state.activeGenerateToken = 2;

    const result = advanceGenerateToken(state);

    expect(result).toBe(3);
    expect(state.activeGenerateToken).toBe(3);
  });

  it('works from initial state', () => {
    const state = makeRunEpoch();

    const result = advanceGenerateToken(state);

    expect(result).toBe(1);
  });

  it('does not affect activeStepEpoch or activeRunEpoch', () => {
    const state = makeRunEpoch();
    state.activeRunEpoch = 5;
    state.activeStepEpoch = 3;

    advanceGenerateToken(state);

    expect(state.activeRunEpoch).toBe(5);
    expect(state.activeStepEpoch).toBe(3);
  });
});

// ─── RunEpochState — cross-function invariants ───────────────────────────────

describe('run epoch state transitions', () => {
  it('step epoch and generate token are independent', () => {
    const state = makeRunEpoch();

    advanceStepEpoch(state);
    advanceGenerateToken(state);
    advanceGenerateToken(state);

    expect(state.activeStepEpoch).toBe(1);
    expect(state.activeGenerateToken).toBe(2);
  });

  it('multiple step epochs advance correctly', () => {
    const state = makeRunEpoch();

    advanceStepEpoch(state);
    advanceStepEpoch(state);
    const step2 = advanceStepEpoch(state);

    expect(step2).toBe(3);
    expect(state.activeStepEpoch).toBe(3);
    expect(state.activeGenerateToken).toBe(0);
  });
});

// ─── BackoffState — nextBackoff ─────────────────────────────────────────────

describe('backoff state', () => {
  it('default backoff is 60 seconds', () => {
    const state = makeBackoff();
    expect(state.backoffMs).toBe(60_000);
  });

  it('instant flag starts false', () => {
    const state = makeBackoff();
    expect(state.instant).toBe(false);
  });

  it('nextStepAt starts as null', () => {
    const state = makeBackoff();
    expect(state.nextStepAt).toBeNull();
  });
});

// ─── ProgressState ───────────────────────────────────────────────────────────

describe('progress state', () => {
  it('initial state has null start time and stage', () => {
    const state = makeProgress();
    expect(state.lastStepStartedAt).toBeNull();
    expect(state.lastStepStage).toBeNull();
  });
});

// ─── State mutation by reference ─────────────────────────────────────────────

describe('state is mutated in place', () => {
  it('advanceStepEpoch mutates passed state object', () => {
    const state = makeRunEpoch();
    const before = state.activeStepEpoch;

    advanceStepEpoch(state);

    expect(state.activeStepEpoch).toBe(before + 1);
  });

  it('advanceGenerateToken mutates passed state object', () => {
    const state = makeRunEpoch();
    const before = state.activeGenerateToken;

    advanceGenerateToken(state);

    expect(state.activeGenerateToken).toBe(before + 1);
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('advanceStepEpoch handles very large epoch values', () => {
    const state = makeRunEpoch();
    state.activeStepEpoch = Number.MAX_SAFE_INTEGER - 1;

    const result = advanceStepEpoch(state);

    expect(result).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('advanceGenerateToken handles very large token values', () => {
    const state = makeRunEpoch();
    state.activeGenerateToken = Number.MAX_SAFE_INTEGER - 1;

    const result = advanceGenerateToken(state);

    expect(result).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('backoff state allows negative nextStepAt values', () => {
    const state = makeBackoff();
    state.nextStepAt = -1;
    expect(state.nextStepAt).toBe(-1);
  });
});
