import { describe, expect, it } from 'vitest';
import { createDefaultContinuationResolver } from '../continuation.js';
import type { StepModelResponse } from '../types.js';

function makeResponse(continuation: 'stop' | 'continue' | 'wait'): StepModelResponse {
  return {
    segments: [],
    actionRequests: [],
    continuation,
  };
}

describe('createDefaultContinuationResolver', () => {
  it('returns continue when pending inputs remain', () => {
    const resolver = createDefaultContinuationResolver();
    const result = resolver({
      modelResponse: makeResponse('stop'),
      actionResults: [],
      pendingInputsRemaining: 5,
    });
    expect(result).toBe('continue');
  });

  it('returns stop when no pending and model says stop', () => {
    const resolver = createDefaultContinuationResolver();
    const result = resolver({
      modelResponse: makeResponse('stop'),
      actionResults: [],
      pendingInputsRemaining: 0,
    });
    expect(result).toBe('stop');
  });

  it('returns wait when no pending and model says wait', () => {
    const resolver = createDefaultContinuationResolver();
    const result = resolver({
      modelResponse: makeResponse('wait'),
      actionResults: [],
      pendingInputsRemaining: 0,
    });
    expect(result).toBe('wait');
  });

  it('ignores model response when pending inputs remain', () => {
    const resolver = createDefaultContinuationResolver();
    const result = resolver({
      modelResponse: makeResponse('wait'),
      actionResults: [],
      pendingInputsRemaining: 1,
    });
    expect(result).toBe('continue');
  });
});
