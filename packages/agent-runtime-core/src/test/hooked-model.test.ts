import { describe, expect, it } from 'vitest';

import { HookedStepModelAdapter } from '../integrations/adapters/hooked-model.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('hooked model adapter', () => {
  it('runs before and after hooks around model generation', async () => {
    const calls: string[] = [];
    const adapter = new HookedStepModelAdapter({
      model: new FakeStepModelAdapter(() => ({
        segments: [{ kind: 'message', text: 'ok' }],
        actionRequests: [],
        continuation: 'stop',
      })),
      beforeGenerate() {
        calls.push('before');
      },
      afterGenerate() {
        calls.push('after');
      },
    });

    const response = await adapter.generateStep({
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
      context: [],
      actions: [],
    });

    expect(response.segments[0]?.text).toBe('ok');
    expect(calls).toEqual(['before', 'after']);
  });
});
