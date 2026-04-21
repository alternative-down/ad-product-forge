import { describe, expect, it } from 'vitest';

import { ConfiguredProviderGateway } from '../integrations/gateways/configured-provider-gateway.js';
import { FallbackProviderGateway } from '../integrations/gateways/fallback-provider-gateway.js';
import { splitProviderModelId, type StepModelProviderConfig, type StepModelProviderGateway } from '../integrations/gateways/providers.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('provider gateway utilities', () => {
  it('splits provider-prefixed model ids into provider and model parts', () => {
    expect(splitProviderModelId('minimax:MiniMax-M2.7')).toEqual({
      providerId: 'minimax',
      providerModelId: 'MiniMax-M2.7',
    });
    expect(splitProviderModelId('MiniMax-M2.7')).toEqual({
      providerId: null,
      providerModelId: 'MiniMax-M2.7',
    });
  });

  it('merges default and provider-specific headers before delegating', async () => {
    let receivedConfig: StepModelProviderConfig | null = null;
    const baseGateway: StepModelProviderGateway = {
      async createStepModel(config) {
        receivedConfig = config;
        return new FakeStepModelAdapter(() => ({
          segments: [{ kind: 'message', text: 'ok' }],
          actionRequests: [],
          continuation: 'stop',
        }));
      },
    };
    const gateway = new ConfiguredProviderGateway({
      base: baseGateway,
      headers: {
        'x-global': '1',
      },
      headersByProvider: {
        minimax: {
          'x-provider': 'minimax',
        },
      },
      defaultTemperature: 0.4,
    });

    await gateway.createStepModel({
      modelId: 'minimax:MiniMax-M2.7',
      headers: {
        'x-request': '1',
      },
    });

    expect(receivedConfig).toMatchObject({
      modelId: 'minimax:MiniMax-M2.7',
      temperature: 0.4,
      headers: {
        'x-global': '1',
        'x-provider': 'minimax',
        'x-request': '1',
      },
    });
  });

  it('falls back to the next provider gateway when one fails', async () => {
    const gateway = new FallbackProviderGateway({
      gateways: [
        {
          async createStepModel() {
            throw new Error('first failed');
          },
        },
        {
          async createStepModel() {
            return new FakeStepModelAdapter(() => ({
              segments: [{ kind: 'message', text: 'fallback ok' }],
              actionRequests: [],
              continuation: 'stop',
            }));
          },
        },
      ],
    });

    const model = await gateway.createStepModel({
      modelId: 'minimax:MiniMax-M2.7',
    });
    const result = await model.generateStep({
      runtimeId: 'runtime-1',
      stepId: 'step-1',
      stepNumber: 1,
      context: [],
      actions: [],
    });

    expect(result.segments[0]?.text).toBe('fallback ok');
  });
});
