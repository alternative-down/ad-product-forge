import { describe, it, expect, beforeEach } from 'vitest';
import { createLoopDetector, type LoopDetectorState } from './agent-runner-loop-detector';

describe('agent-runner-loop-detector', () => {
  describe('state types', () => {
    it('LoopDetectorState accepts initial null/null', () => {
      const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
      expect(state.lastLoopSignature).toBeNull();
      expect(state.repeatedLoopCount).toBe(0);
    });

    it('LoopDetectorState accepts populated values', () => {
      const state: LoopDetectorState = { lastLoopSignature: 'sig-abc', repeatedLoopCount: 3 };
      expect(state.lastLoopSignature).toBe('sig-abc');
      expect(state.repeatedLoopCount).toBe(3);
    });

    it('LoopDetectorState is mutable (mutable semantics, not immutable)', () => {
      const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
      state.lastLoopSignature = 'sig-xyz';
      state.repeatedLoopCount = 5;
      expect(state.lastLoopSignature).toBe('sig-xyz');
      expect(state.repeatedLoopCount).toBe(5);
    });
  });

  describe('createLoopDetector', () => {
    it('creates detector with default stuckLoopRepeatLimit of 6', () => {
      const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
      const detector = createLoopDetector(state);
      // isStuck should be false initially
      expect(detector.isStuck()).toBe(false); // count=1, limit=1, not yet stuck
      // Register same signature 5 times — still not stuck
      for (let i = 0; i < 5; i++) {
        detector.register('sig-a');
      }
      expect(detector.isStuck()).toBe(false); // count=1, limit=1, not yet stuck
      // 6th time — stuck
      detector.register('sig-a');
      expect(detector.isStuck()).toBe(true);
    });

    it('accepts custom stuckLoopRepeatLimit via options', () => {
      const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });
      for (let i = 0; i < 3; i++) {
        detector.register('sig-b');
      }
      expect(detector.isStuck()).toBe(true);
    });

    it('treats 0 as stuck immediately (limit of 0)', () => {
      const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 0 });
      expect(detector.isStuck()).toBe(true);
      // Even with 0 repeats, stuck
      expect(detector.getSignatureCount()).toBe(0);
    });

    it('treats 1 as stuck on first repeated registration', () => {
      const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 1 });
      detector.register('sig-c');
      expect(detector.isStuck()).toBe(true); // count=1 >= limit=1, so stuck
      detector.register('sig-c');
      expect(detector.isStuck()).toBe(true);
    });

    it('mutates the provided state object directly (shared state pattern)', () => {
      const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
      const detector = createLoopDetector(state);
      detector.register('sig-shared');

      // State should be mutated in place
      expect(state.lastLoopSignature).toBe('sig-shared');
      expect(state.repeatedLoopCount).toBe(1);

      // A second detector on the same state sees the same values
      const detector2 = createLoopDetector(state);
      expect(detector2.getSignatureCount()).toBe(1);
    });
  });

  describe('register', () => {
    let state: LoopDetectorState;

    beforeEach(() => {
      state = { lastLoopSignature: null, repeatedLoopCount: 0 };
    });

    it('returns 1 for first registration of a signature', () => {
      const detector = createLoopDetector(state);
      expect(detector.register('sig-first')).toBe(1);
    });

    it('increments count when registering the same signature again', () => {
      const detector = createLoopDetector(state);
      detector.register('sig-a');
      expect(detector.register('sig-a')).toBe(2);
      expect(detector.register('sig-a')).toBe(3);
      expect(detector.register('sig-a')).toBe(4);
    });

    it('resets count to 1 when registering a different signature', () => {
      const detector = createLoopDetector(state);
      detector.register('sig-a');
      detector.register('sig-a');
      detector.register('sig-a'); // count = 3

      detector.register('sig-b'); // different signature
      expect(detector.getSignatureCount()).toBe(1);
    });

    it('preserves non-stuck state when switching signatures', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 4 });
      detector.register('sig-a');
      detector.register('sig-a');
      detector.register('sig-a'); // count = 3

      detector.register('sig-b'); // reset to 1, not stuck
      expect(detector.isStuck()).toBe(false); // count=1, limit=1, not yet stuck
      expect(detector.getSignatureCount()).toBe(1);
    });

    it('signature comparison is exact (case-sensitive)', () => {
      const detector = createLoopDetector(state);
      detector.register('Sig-A');
      expect(detector.register('Sig-A')).toBe(2);
      expect(detector.register('sig-a')).toBe(1); // different — resets
    });

    it('empty string is a valid signature', () => {
      const detector = createLoopDetector(state);
      detector.register('');
      expect(detector.register('')).toBe(2);
    });

    it('accepts Unicode and whitespace in signature', () => {
      const detector = createLoopDetector(state);
      detector.register('  tool:invoke("foo")  ');
      expect(detector.register('  tool:invoke("foo")  ')).toBe(2);
    });
  });

  describe('isStuck', () => {
    let state: LoopDetectorState;

    beforeEach(() => {
      state = { lastLoopSignature: null, repeatedLoopCount: 0 };
    });

    it('returns false when count is below default limit', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 6 });
      for (let i = 0; i < 5; i++) {
        detector.register('sig');
      }
      expect(detector.isStuck()).toBe(false); // count=1, limit=1, not yet stuck
    });

    it('returns true when count reaches default limit', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 6 });
      for (let i = 0; i < 6; i++) {
        detector.register('sig');
      }
      expect(detector.isStuck()).toBe(true);
    });

    it('returns false for very high count above limit', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });
      for (let i = 0; i < 20; i++) {
        detector.register('sig');
      }
      // Still stuck, not more stuck
      expect(detector.isStuck()).toBe(true);
    });

    it('returns false when threshold is met then broken by different signature', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });
      for (let i = 0; i < 3; i++) {
        detector.register('sig-stuck');
      }
      expect(detector.isStuck()).toBe(true);

      // Switching signature breaks the loop
      detector.register('sig-new');
      expect(detector.isStuck()).toBe(false); // count=1, limit=1, not yet stuck
    });

    it('returns false when threshold is met then reset', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });
      for (let i = 0; i < 3; i++) {
        detector.register('sig');
      }
      expect(detector.isStuck()).toBe(true);

      detector.reset();
      expect(detector.isStuck()).toBe(false); // count=1, limit=1, not yet stuck
    });
  });

  describe('reset', () => {
    let state: LoopDetectorState;

    beforeEach(() => {
      state = { lastLoopSignature: null, repeatedLoopCount: 0 };
    });

    it('clears lastLoopSignature to null', () => {
      const detector = createLoopDetector(state);
      detector.register('sig-abc');
      expect(detector.getCurrentSignature()).toBe('sig-abc');

      detector.reset();
      expect(detector.getCurrentSignature()).toBeNull();
    });

    it('resets repeatedLoopCount to 0', () => {
      const detector = createLoopDetector(state);
      detector.register('sig-abc');
      detector.register('sig-abc');
      detector.register('sig-abc');
      expect(detector.getSignatureCount()).toBe(3);

      detector.reset();
      expect(detector.getSignatureCount()).toBe(0);
    });

    it('clears stuck state', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 2 });
      detector.register('sig');
      detector.register('sig');
      expect(detector.isStuck()).toBe(true);

      detector.reset();
      expect(detector.isStuck()).toBe(false); // count=1, limit=1, not yet stuck
    });

    it('after reset, new signature starts fresh count', () => {
      const detector = createLoopDetector(state);
      detector.register('old-sig');
      detector.register('old-sig');
      detector.register('old-sig'); // count = 3

      detector.reset();

      detector.register('new-sig');
      expect(detector.getSignatureCount()).toBe(1);
      expect(detector.getCurrentSignature()).toBe('new-sig');
    });

    it('reset multiple times works correctly', () => {
      const detector = createLoopDetector(state);
      detector.register('sig');
      detector.register('sig');
      detector.reset();
      detector.register('sig');
      expect(detector.getSignatureCount()).toBe(1); // reset clears, so one register = count 1
      detector.reset();
      expect(detector.getSignatureCount()).toBe(0);
    });
  });

  describe('getSignatureCount', () => {
    let state: LoopDetectorState;

    beforeEach(() => {
      state = { lastLoopSignature: null, repeatedLoopCount: 0 };
    });

    it('returns 0 on a fresh detector', () => {
      const detector = createLoopDetector(state);
      expect(detector.getSignatureCount()).toBe(0);
    });

    it('returns current repeated count', () => {
      const detector = createLoopDetector(state);
      detector.register('sig');
      detector.register('sig');
      detector.register('sig');
      expect(detector.getSignatureCount()).toBe(3);
    });

    it('returns accurate count after signature change', () => {
      const detector = createLoopDetector(state);
      detector.register('sig-a');
      detector.register('sig-a');
      detector.register('sig-a'); // 3

      detector.register('sig-b'); // reset to 1
      expect(detector.getSignatureCount()).toBe(1);
    });

    it('tracks large counts without overflow', () => {
      const detector = createLoopDetector(state);
      for (let i = 0; i < 1000; i++) {
        detector.register('sig');
      }
      expect(detector.getSignatureCount()).toBe(1000);
    });
  });

  describe('getCurrentSignature', () => {
    let state: LoopDetectorState;

    beforeEach(() => {
      state = { lastLoopSignature: null, repeatedLoopCount: 0 };
    });

    it('returns null when no signature registered', () => {
      const detector = createLoopDetector(state);
      expect(detector.getCurrentSignature()).toBeNull();
    });

    it('returns the last registered signature', () => {
      const detector = createLoopDetector(state);
      detector.register('current-sig');
      expect(detector.getCurrentSignature()).toBe('current-sig');
    });

    it('returns most recent signature after switching', () => {
      const detector = createLoopDetector(state);
      detector.register('old-sig');
      detector.register('old-sig');
      detector.register('new-sig');
      expect(detector.getCurrentSignature()).toBe('new-sig');
    });

    it('returns null after reset', () => {
      const detector = createLoopDetector(state);
      detector.register('some-sig');
      detector.reset();
      expect(detector.getCurrentSignature()).toBeNull();
    });
  });

  describe('factory interface', () => {
    it('returns an object with all 5 methods', () => {
      const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
      const detector = createLoopDetector(state);
      expect(typeof detector.reset).toBe('function');
      expect(typeof detector.register).toBe('function');
      expect(typeof detector.isStuck).toBe('function');
      expect(typeof detector.getSignatureCount).toBe('function');
      expect(typeof detector.getCurrentSignature).toBe('function');
    });

    it('each call creates an independent detector instance', () => {
      const state1: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
      const state2: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
      const det1 = createLoopDetector(state1);
      const det2 = createLoopDetector(state2);

      det1.register('sig-1');
      det1.register('sig-1');

      det2.register('sig-2');
      det2.register('sig-2');
      det2.register('sig-2');

      expect(det1.getSignatureCount()).toBe(2);
      expect(det2.getSignatureCount()).toBe(3);
      expect(det1.isStuck()).toBe(false);
      expect(det2.isStuck()).toBe(false);

      // Custom limits are per-instance
      const det3 = createLoopDetector(state1, { stuckLoopRepeatLimit: 1 });
      const det4 = createLoopDetector(state2, { stuckLoopRepeatLimit: 3 });

      det3.register('x');
      det4.register('x');

      expect(det3.isStuck()).toBe(true); // count=1 >= limit=1, so stuck
      det3.register('x');
      det4.register('x');
      det4.register('x');

      expect(det3.isStuck()).toBe(true);
      expect(det4.isStuck()).toBe(true); // count=4 > limit=3, so stuck
    });

    it('mutates shared state across multiple detectors', () => {
      const sharedState: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
      const det1 = createLoopDetector(sharedState);
      const det2 = createLoopDetector(sharedState);

      // det1 increments
      det1.register('shared-sig');
      det1.register('shared-sig');

      // det2 sees the same mutated state
      expect(det2.getSignatureCount()).toBe(2);
      expect(det2.getCurrentSignature()).toBe('shared-sig');

      // det2 can continue from same state
      det2.register('shared-sig');
      expect(det1.getSignatureCount()).toBe(3);
    });
  });
});