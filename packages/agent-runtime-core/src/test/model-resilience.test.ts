import { describe, expect, it } from 'vitest';

import { FallbackStepModelAdapter } from '../integrations/adapters/fallback-model.js';
import { RetryingStepModelAdapter } from '../integrations/adapters/retrying-model.js';
import { TimeoutStepModelAdapter } from '../integrations/adapters/timeout-model.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

const request = {
  runtimeId: 'runtime-1',
  stepId: 'step-1',
  stepNumber: 1,
  context: [],
  actions: [],
};

describe('model resilience adapters', () => {
  it('retries a failing model until it succeeds', async () => {
    let attempts = 0;
    const model = new RetryingStepModelAdapter({
      model: new FakeStepModelAdapter(() => {
        attempts += 1;

        if (attempts < 2) {
          throw new Error('temporary failure');
        }

        return {
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
      maxAttempts: 2,
    });

    const result = await model.generateStep(request);

    expect(result.segments[0]?.text).toBe('ok');
    expect(attempts).toBe(2);
  });

  it('falls back to the next model when the first fails', async () => {
    const model = new FallbackStepModelAdapter({
      models: [
        new FakeStepModelAdapter(() => {
          throw new Error('first failed');
        }),
        new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'fallback ok' }],
          actionRequests: [],
          continuation: 'stop',
        })),
      ],
    });

    const result = await model.generateStep(request);

    expect(result.segments[0]?.text).toBe('fallback ok');
  });

  it('times out a slow model', async () => {
    const model = new TimeoutStepModelAdapter({
      model: new FakeStepModelAdapter(async () => {
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          segments: [{ kind: 'message', text: 'late' }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
      timeoutMs: 10,
    });

    await expect(model.generateStep(request)).rejects.toThrow(/timed out/i);
  });
});
