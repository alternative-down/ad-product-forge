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

        // First system message should be cached
        expect(prompt[0]).toMatchObject({
          role: 'system',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral', ttl: '1h' },
            },
          },
        });

        // Second message (assistant from previous step) should be cached
        expect(prompt[1]).toMatchObject({
          role: 'assistant',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral', ttl: '1h' },
            },
          },
        });

        // Third message (user) should be cached
        expect(prompt[2]).toMatchObject({
          role: 'user',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral', ttl: '1h' },
            },
          },
        });

        // Last message (latest assistant output) should NOT be cached
        expect(prompt[3]).toMatchObject({
          role: 'assistant',
          providerOptions: undefined,
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

  it('does not modify prompt with single message', async () => {
    const model = wrapAnthropicPromptCacheModel(new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        // Single message should not have cache control added
        expect(options.prompt[0]).toMatchObject({
          role: 'system',
          providerOptions: undefined,
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
    });
  });

  it('skips messages that already have cache control', async () => {
    const model = wrapAnthropicPromptCacheModel(new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        const prompt = options.prompt;

        // First message with existing cache control should keep its original ttl
        expect(prompt[0]).toMatchObject({
          role: 'system',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral', ttl: '30m' }, // Original ttl
            },
          },
        });

        // Second message should get the new cache control
        expect(prompt[1]).toMatchObject({
          role: 'assistant',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral', ttl: '1h' }, // New ttl
            },
          },
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
      ],
    });
  });
});
