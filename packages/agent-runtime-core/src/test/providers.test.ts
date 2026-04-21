import { describe, expect, it } from 'vitest';

import { InMemoryProviderGateway } from '../integrations/gateways/in-memory-provider-gateway.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('provider gateway', () => {
  it('creates step models from registered provider factories', async () => {
    const gateway = new InMemoryProviderGateway();

    gateway.register('fake', (config) => new FakeStepModelAdapter(() => ({
      segments: [{
        kind: 'message',
        text: `provider ${config.modelId}`,
      }],
      actionRequests: [],
      continuation: 'stop',
    })));

    const model = await gateway.createStepModel({
      modelId: 'fake:demo-model',
      headers: { authorization: 'Bearer secret' },
    });
    const response = await model.generateStep({
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
      context: [],
      actions: [],
    });

    expect(response.segments[0]?.text).toBe('provider fake:demo-model');
  });
});

