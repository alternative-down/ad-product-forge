import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { generateText } from 'ai';
import type { LanguageModelV3CallOptions } from '@ai-sdk/provider-v6';

import { wrapAnthropicPromptCacheModel } from './anthropic-prompt-cache.js';

describe('wrapAnthropicPromptCacheModel', () => {
  it('marks the first system message for prompt caching', async () => {
    const model = wrapAnthropicPromptCacheModel(new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        expect(options.prompt).toEqual([
          {
            role: 'system',
            content: 'Base system.',
            providerOptions: {
              anthropic: {
                cacheControl: {
                  type: 'ephemeral',
                  ttl: '1h',
                },
              },
            },
          },
          {
            role: 'assistant',
            content: [{
              type: 'text',
              text: 'Previous step.',
              providerOptions: undefined,
            }],
            providerOptions: undefined,
          },
          {
            role: 'user',
            content: [{
              type: 'text',
              text: 'Continue.',
              providerOptions: undefined,
            }],
            providerOptions: undefined,
          },
          {
            role: 'assistant',
            content: [{
              type: 'text',
              text: 'Latest assistant output.',
              providerOptions: undefined,
            }],
            providerOptions: undefined,
          },
        ]);

        return {
          content: [{ type: 'text', text: 'ok' }],
          finishReason: { raw: 'stop', unified: 'stop' },
          usage: {
            inputTokens: {
              total: 10,
              noCache: 10,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 2,
              text: 2,
              reasoning: 0,
            },
          },
          warnings: [],
        };
      },
    }));

    await generateText({
      model,
      system: 'Base system.',
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Previous step.' }],
        },
        {
          role: 'user',
          content: [{ type: 'text', text: 'Continue.' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Latest assistant output.' }],
        },
      ],
    });
  });
});
