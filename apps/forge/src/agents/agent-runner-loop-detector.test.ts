import { describe, it, expect, beforeEach } from 'vitest';
import { createLoopDetector, type LoopDetectorState } from './agent-runner-loop-detector';

describe('createLoopDetector', () => {
  let state: LoopDetectorState;

  beforeEach(() => {
    state = { lastLoopSignature: null, repeatedLoopCount: 0 };
  });

  describe('reset', () => {
    it('clears lastLoopSignature and repeatedLoopCount', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });
      detector.register('same-signature');
      detector.register('same-signature');
      detector.reset();
      expect(detector.getCurrentSignature()).toBeNull();
      expect(detector.getSignatureCount()).toBe(0);
    });
  });

  describe('register', () => {
    it('returns 1 for a new signature', () => {
      const detector = createLoopDetector(state);
      const count = detector.register('first-signature');
      expect(count).toBe(1);
    });

    it('increments count when the same signature is registered again', () => {
      const detector = createLoopDetector(state);
      detector.register('same');
      detector.register('same');
      detector.register('same');
      expect(detector.getSignatureCount()).toBe(3);
      expect(detector.register('same')).toBe(4);
    });

    it('resets count to 1 when a different signature is registered', () => {
      const detector = createLoopDetector(state);
      detector.register('sig-A');
      detector.register('sig-A');
      detector.register('sig-A');
      detector.register('sig-B');
      expect(detector.getSignatureCount()).toBe(1);
      expect(detector.register('sig-B')).toBe(2);
    });

    it('stores the current signature', () => {
      const detector = createLoopDetector(state);
      detector.register('my-signature');
      expect(detector.getCurrentSignature()).toBe('my-signature');
      detector.register('another');
      expect(detector.getCurrentSignature()).toBe('another');
    });
  });

  describe('isStuck', () => {
    it('returns false before repeat limit is reached', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });
      detector.register('sig');
      expect(detector.isStuck()).toBe(false);
      detector.register('sig');
      expect(detector.isStuck()).toBe(false);
    });

    it('returns true once repeat count reaches the limit', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });
      detector.register('sig');
      detector.register('sig');
      expect(detector.isStuck()).toBe(false);
      detector.register('sig');
      expect(detector.isStuck()).toBe(true);
    });

    it('defaults to stuckLoopRepeatLimit of 6', () => {
      const detector = createLoopDetector(state);
      for (let i = 0; i < 5; i++) detector.register('sig');
      expect(detector.isStuck()).toBe(false);
      detector.register('sig');
      expect(detector.isStuck()).toBe(true);
    });

    it('returns false when a different signature is registered after being stuck', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });
      detector.register('sig');
      detector.register('sig');
      detector.register('sig'); // isStuck === true now
      detector.register('new-sig'); // reset to 1
      expect(detector.isStuck()).toBe(false);
    });
  });

  describe('getSignatureCount', () => {
    it('returns 0 initially', () => {
      const detector = createLoopDetector(state);
      expect(detector.getSignatureCount()).toBe(0);
    });

    it('returns the current repeat count', () => {
      const detector = createLoopDetector(state);
      detector.register('x');
      detector.register('x');
      detector.register('x');
      expect(detector.getSignatureCount()).toBe(3);
    });
  });

  describe('getCurrentSignature', () => {
    it('returns null initially', () => {
      const detector = createLoopDetector(state);
      expect(detector.getCurrentSignature()).toBeNull();
    });

    it('returns null after reset', () => {
      const detector = createLoopDetector(state);
      detector.register('sig');
      detector.reset();
      expect(detector.getCurrentSignature()).toBeNull();
    });

    it('returns the most recent signature', () => {
      const detector = createLoopDetector(state);
      detector.register('a');
      detector.register('a');
      detector.register('b');
      expect(detector.getCurrentSignature()).toBe('b');
    });
  });

  describe('custom stuckLoopRepeatLimit', () => {
    it('uses custom limit of 1 (immediate stuck)', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 1 });
      detector.register('sig');
      expect(detector.isStuck()).toBe(true);
    });

    it('uses custom limit of 10', () => {
      const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 10 });
      for (let i = 0; i < 9; i++) detector.register('sig');
      expect(detector.isStuck()).toBe(false);
      detector.register('sig');
      expect(detector.isStuck()).toBe(true);
    });
  });
});