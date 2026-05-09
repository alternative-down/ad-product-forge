/**
 * Unit tests for agents/agent-loop-detector.ts.
 * Pure state manager for agent iteration loop detection.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import {
  createLoopDetector,
  type LoopDetectorState,
} from './agent-runner-loop-detector';

function makeState(overrides: Partial<LoopDetectorState> = {}): LoopDetectorState {
  return {
    lastLoopSignature: null,
    repeatedLoopCount: 0,
    ...overrides,
  };
}

// ─── reset ──────────────────────────────────────────────────────────────────

describe('reset', () => {
  it('clears lastLoopSignature and repeatedLoopCount', () => {
    const state = makeState({ lastLoopSignature: 'sig-abc', repeatedLoopCount: 5 });
    const detector = createLoopDetector(state);

    detector.reset();

    expect(state.lastLoopSignature).toBeNull();
    expect(state.repeatedLoopCount).toBe(0);
  });

  it('works on freshly created detector', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    detector.reset();

    expect(state.lastLoopSignature).toBeNull();
    expect(state.repeatedLoopCount).toBe(0);
  });
});

// ─── register ───────────────────────────────────────────────────────────────

describe('register', () => {
  it('returns 1 on first signature registration', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    const count = detector.register('first-sig');

    expect(count).toBe(1);
    expect(state.lastLoopSignature).toBe('first-sig');
  });

  it('increments count when same signature is registered again', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    detector.register('loop-sig');
    detector.register('loop-sig');
    const count = detector.register('loop-sig');

    expect(count).toBe(3);
    expect(state.repeatedLoopCount).toBe(3);
  });

  it('returns 1 and resets count when a new signature is registered', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    detector.register('old-sig');
    detector.register('old-sig');
    const count = detector.register('new-sig');

    expect(count).toBe(1);
    expect(state.lastLoopSignature).toBe('new-sig');
    expect(state.repeatedLoopCount).toBe(1);
  });

  it('can track multiple signature sequences', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    detector.register('sig-a');
    detector.register('sig-a');
    detector.register('sig-b');
    detector.register('sig-b');
    detector.register('sig-b');
    const count = detector.register('sig-b');

    expect(count).toBe(4);
    expect(state.lastLoopSignature).toBe('sig-b');
  });
});

// ─── isStuck ─────────────────────────────────────────────────────────────────

describe('isStuck', () => {
  it('returns false when count is below default limit (6)', () => {
    const state = makeState({ lastLoopSignature: 'sig', repeatedLoopCount: 5 });
    const detector = createLoopDetector(state);

    expect(detector.isStuck()).toBe(false);
  });

  it('returns true when count reaches default limit (6)', () => {
    const state = makeState({ lastLoopSignature: 'sig', repeatedLoopCount: 6 });
    const detector = createLoopDetector(state);

    expect(detector.isStuck()).toBe(true);
  });

  it('returns true when count exceeds default limit', () => {
    const state = makeState({ lastLoopSignature: 'sig', repeatedLoopCount: 10 });
    const detector = createLoopDetector(state);

    expect(detector.isStuck()).toBe(true);
  });

  it('respects custom stuckLoopRepeatLimit option', () => {
    const state = makeState({ lastLoopSignature: 'sig', repeatedLoopCount: 2 });
    const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });

    expect(detector.isStuck()).toBe(false);

    const state2 = makeState({ lastLoopSignature: 'sig', repeatedLoopCount: 4 });
    const detector2 = createLoopDetector(state2, { stuckLoopRepeatLimit: 3 });

    expect(detector2.isStuck()).toBe(true);
  });

  it('returns false when repeatedLoopCount is 0', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    expect(detector.isStuck()).toBe(false);
  });
});

// ─── getSignatureCount ───────────────────────────────────────────────────────

describe('getSignatureCount', () => {
  it('returns 0 when no signature registered', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    expect(detector.getSignatureCount()).toBe(0);
  });

  it('returns 1 after first registration', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    detector.register('sig');

    expect(detector.getSignatureCount()).toBe(1);
  });

  it('returns correct count after multiple registrations', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    detector.register('sig');
    detector.register('sig');
    detector.register('sig');

    expect(detector.getSignatureCount()).toBe(3);
  });

  it('returns 1 after registering new signature', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    detector.register('sig');
    detector.register('sig');
    detector.register('sig');
    detector.register('new-sig');

    expect(detector.getSignatureCount()).toBe(1);
  });
});

// ─── getCurrentSignature ─────────────────────────────────────────────────────

describe('getCurrentSignature', () => {
  it('returns null when no signature registered', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    expect(detector.getCurrentSignature()).toBeNull();
  });

  it('returns the last registered signature', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    detector.register('first');
    detector.register('second');

    expect(detector.getCurrentSignature()).toBe('second');
  });

  it('returns null after reset', () => {
    const state = makeState();
    const detector = createLoopDetector(state);

    detector.register('sig');
    detector.reset();

    expect(detector.getCurrentSignature()).toBeNull();
  });
});
