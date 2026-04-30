import { describe, expect, it } from 'vitest';
import { createLoopDetector, type LoopDetectorState } from './agent-runner-loop-detector';

describe('createLoopDetector', () => {
  it('starts with no loop detected', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    expect(detector.isStuck()).toBe(false);
    expect(detector.getSignatureCount()).toBe(0);
    expect(detector.getCurrentSignature()).toBeNull();
  });

  it('register returns 1 on first occurrence of a signature', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    const count = detector.register('run step');
    expect(count).toBe(1);
    expect(detector.getCurrentSignature()).toBe('run step');
  });

  it('register increments count on same signature repeated', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    detector.register('repeat-me');
    detector.register('repeat-me');
    detector.register('repeat-me');

    expect(detector.getSignatureCount()).toBe(3);
    expect(detector.isStuck()).toBe(false); // 3 < 6
  });

  it('changing signature resets count and updates signature', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    detector.register('first');
    detector.register('first');
    detector.register('first');

    detector.register('second');

    expect(detector.getSignatureCount()).toBe(1);
    expect(detector.getCurrentSignature()).toBe('second');
  });

  it('isStuck returns true when repeat count reaches the limit', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    for (let i = 0; i < 6; i++) {
      detector.register('stuck-loop');
    }

    expect(detector.isStuck()).toBe(true);
  });

  it('isStuck returns false just below the limit', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    for (let i = 0; i < 5; i++) {
      detector.register('almost-stuck');
    }

    expect(detector.isStuck()).toBe(false);
  });

  it('reset clears state completely', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    for (let i = 0; i < 4; i++) {
      detector.register('loop');
    }
    expect(detector.isStuck()).toBe(false);

    detector.reset();

    expect(detector.getCurrentSignature()).toBeNull();
    expect(detector.getSignatureCount()).toBe(0);
    expect(detector.isStuck()).toBe(false);
  });

  it('custom stuckLoopRepeatLimit changes the threshold', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });

    for (let i = 0; i < 3; i++) {
      detector.register('bounded-loop');
    }

    expect(detector.isStuck()).toBe(true);
  });

  it('register returns current repeat count after each call', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    expect(detector.register('sig-A')).toBe(1);
    expect(detector.register('sig-A')).toBe(2);
    expect(detector.register('sig-B')).toBe(1);
    expect(detector.register('sig-B')).toBe(2);
    expect(detector.register('sig-B')).toBe(3);
  });

  it('empty string signature works correctly', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    detector.register('');
    detector.register('');

    expect(detector.getSignatureCount()).toBe(2);
    expect(detector.getCurrentSignature()).toBe('');
  });

  it('unicode signatures are handled correctly', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    detector.register('ループ検出🔄');
    detector.register('ループ検出🔄');

    expect(detector.getSignatureCount()).toBe(2);
    expect(detector.isStuck()).toBe(false);
  });

  it('reset then register new signature starts fresh count', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    detector.register('long-loop');
    detector.register('long-loop');
    detector.register('long-loop');
    detector.reset();
    detector.register('new-sig');

    expect(detector.getSignatureCount()).toBe(1);
    expect(detector.getCurrentSignature()).toBe('new-sig');
  });
});
