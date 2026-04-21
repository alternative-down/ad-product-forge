import { describe, expect, it } from 'vitest';

import {
  getStepMessageSegments,
  getStepMessageText,
  getStepReasoningText,
} from '../core/step-output.js';

describe('step output helpers', () => {
  it('extracts message and reasoning text from a model response', () => {
    const response = {
      segments: [
        { kind: 'reasoning' as const, text: 'think' },
        { kind: 'message' as const, text: 'hello' },
        { kind: 'message' as const, text: 'world' },
      ],
      actionRequests: [],
      continuation: 'stop' as const,
    };

    expect(getStepMessageSegments(response)).toHaveLength(2);
    expect(getStepMessageText(response)).toBe('hello\nworld');
    expect(getStepReasoningText(response)).toBe('think');
  });
});
