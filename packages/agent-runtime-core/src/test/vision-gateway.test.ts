import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';

import { AiSdkVisionGateway } from '../integrations/gateways/ai-sdk-vision.js';

describe('ai sdk vision gateway', () => {
  it('sends prompt and images through ai sdk generateText', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'The image shows a forge.' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: {
            total: 10,
            noCache: 10,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: {
            total: 5,
            text: 5,
            reasoning: undefined,
          },
        },
        warnings: [],
      }),
    });
    const gateway = new AiSdkVisionGateway({
      model,
    });

    const result = await gateway.analyze({
      prompt: 'Describe this image.',
      images: [{
        mimeType: 'image/png',
        bytes: new Uint8Array([1, 2, 3]),
      }],
    });

    expect(result.text).toBe('The image shows a forge.');
    expect(model.doGenerateCalls).toHaveLength(1);
  });
});
