import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import { generateText } from 'ai';
import type { LanguageModelV3CallOptions } from '@ai-sdk/provider-v6';

import { wrapAnthropicPromptCacheModel } from './anthropic-prompt-cache.js';

describe('wrapAnthropicPromptCacheModel', () => {
  it('marks all messages except the last one for prompt caching', async () => {
    const model = wrapAnthropicPromptCacheModel(new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        const prompt = options.prompt;

        // First system message (string content) - cache at message level
        expect(prompt[0]).toMatchObject({
          role: 'system',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral', ttl: '1h' },
            },
          },
        });

        // Second message (array content) - cache at last part level
        expect(prompt[1]).toMatchObject({
          role: 'assistant',
          content: expect.arrayContaining([
            expect.objectContaining({
              providerOptions: {
                anthropic: {
                  cacheControl: { type: 'ephemeral', ttl: '1h' },
                },
              },
            }),
          ]),
        });

        // Third message (array content) - cache at last part level
        expect(prompt[2]).toMatchObject({
          role: 'user',
          content: expect.arrayContaining([
            expect.objectContaining({
              providerOptions: {
                anthropic: {
                  cacheControl: { type: 'ephemeral', ttl: '1h' },
                },
              },
            }),
          ]),
        });

        // Last message - should NOT be cached
        expect(prompt[3]).toMatchObject({
          role: 'assistant',
          content: [{ type: 'text', text: 'Latest assistant output.' }],
        });

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

  it('caches only the system message when there are two messages total', async () => {
    const model = wrapAnthropicPromptCacheModel(new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        const prompt = options.prompt;

        // System message (string content) - should be cached
        expect(prompt[0]).toMatchObject({
          role: 'system',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral', ttl: '1h' },
            },
          },
        });

        // User message (last) - should NOT be cached
        expect(prompt[1]).toMatchObject({
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
        });

        return {
          content: [{ type: 'text', text: 'ok' }],
          finishReason: { raw: 'stop', unified: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 2, text: 2, reasoning: 0 },
          },
          warnings: [],
        };
      },
    }));

    await generateText({
      model,
      system: 'Single system message.',
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
    });
  });

  it('preserves existing cache control and adds to messages without it', async () => {
    // System has existing cache at message level - should be preserved
    // Assistant at index 1 has array content - should get cache at part level
    // Assistant at index 2 is last - should NOT get cache
    const model = wrapAnthropicPromptCacheModel(new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        const prompt = options.prompt;

        // System message should keep its original ttl (30m) at message level
        expect(prompt[0]).toMatchObject({
          role: 'system',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral', ttl: '30m' },
            },
          },
        });

        // Assistant at index 1 (array content) should get cache at part level
        expect(prompt[1]).toMatchObject({
          role: 'assistant',
          content: expect.arrayContaining([
            expect.objectContaining({
              providerOptions: {
                anthropic: {
                  cacheControl: { type: 'ephemeral', ttl: '1h' },
                },
              },
            }),
          ]),
        });

        // Assistant at index 2 is LAST - should NOT be cached
        expect(prompt[2]).toMatchObject({
          role: 'assistant',
          content: [{ type: 'text', text: 'Latest output.' }],
        });

        return {
          content: [{ type: 'text', text: 'ok' }],
          finishReason: { raw: 'stop', unified: 'stop' },
          usage: {
            inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
            outputTokens: { total: 2, text: 2, reasoning: 0 },
          },
          warnings: [],
        };
      },
    }));

    await generateText({
      model,
      system: [
        {
          role: 'system',
          content: [
            { type: 'text', text: 'System with existing cache.' },
          ],
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral', ttl: '30m' } },
          },
        },
      ],
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Previous step.' }],
        },
        {
          role: 'assistant',
          content: [{ type: 'text', text: 'Latest output.' }],
        },
      ],
    });
  });
});
