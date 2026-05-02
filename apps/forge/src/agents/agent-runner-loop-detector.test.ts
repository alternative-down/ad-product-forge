import { describe, expect, it } from 'vitest';
import { createLoopDetector, type LoopDetectorState } from './agent-runner-loop-detector';

describe('createLoopDetector', () => {
  it('starts with no loop signature', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    expect(detector.getCurrentSignature()).toBeNull();
    expect(detector.getSignatureCount()).toBe(0);
  });

  it('registers a new signature', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    const count = detector.register('call_tool_x');

    expect(detector.getCurrentSignature()).toBe('call_tool_x');
    expect(detector.getSignatureCount()).toBe(1);
    expect(count).toBe(1);
  });

  it('increments count when same signature repeats', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    detector.register('call_tool_x');
    detector.register('call_tool_x');
    detector.register('call_tool_x');

    expect(detector.getSignatureCount()).toBe(3);
  });

  it('resets count and signature when new signature appears', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    detector.register('call_tool_x');
    detector.register('call_tool_x');
    detector.register('call_tool_y');

    expect(detector.getCurrentSignature()).toBe('call_tool_y');
    expect(detector.getSignatureCount()).toBe(1);
  });

  it('resets state', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    detector.register('call_tool_x');
    detector.register('call_tool_x');
    detector.reset();

    expect(detector.getCurrentSignature()).toBeNull();
    expect(detector.getSignatureCount()).toBe(0);
  });

  it('is stuck when repeat limit reached', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });

    for (let i = 0; i < 3; i++) {
      detector.register('call_tool_x');
    }

    expect(detector.isStuck()).toBe(true);
  });

  it('is not stuck before repeat limit', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });

    detector.register('call_tool_x');
    detector.register('call_tool_x');

    expect(detector.isStuck()).toBe(false);
  });

  it('uses default stuckLoopRepeatLimit of 6', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    for (let i = 0; i < 6; i++) {
      detector.register('call_tool_x');
    }

    expect(detector.isStuck()).toBe(true);
  });

  it('resets stuck state when signature changes', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 3 });

    for (let i = 0; i < 3; i++) {
      detector.register('call_tool_x');
    }
    expect(detector.isStuck()).toBe(true);

    detector.register('call_tool_y');
    expect(detector.isStuck()).toBe(false);
    expect(detector.getSignatureCount()).toBe(1);
  });

  it('handles empty signature string', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    detector.register('');
    expect(detector.getCurrentSignature()).toBe('');

    detector.register('');
    expect(detector.getSignatureCount()).toBe(2);
  });

  it('works with complex signature strings', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state);

    const sig = JSON.stringify({ tool: 'send_message', args: { targetKey: 'user-1' } });
    detector.register(sig);
    detector.register(sig);

    expect(detector.getSignatureCount()).toBe(2);
    expect(detector.getCurrentSignature()).toBe(sig);
  });

  it('allows custom stuckLoopRepeatLimit', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 1 });

    detector.register('call_tool_x');

    expect(detector.isStuck()).toBe(true);
  });

  it('reset clears stuck state', () => {
    const state: LoopDetectorState = { lastLoopSignature: null, repeatedLoopCount: 0 };
    const detector = createLoopDetector(state, { stuckLoopRepeatLimit: 1 });

    detector.register('call_tool_x');
    expect(detector.isStuck()).toBe(true);

    detector.reset();
    expect(detector.isStuck()).toBe(false);
  });
});