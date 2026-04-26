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

  it('caches only the system message when there are two messages total', async () => {
    // With system + user (2 messages), only system gets cached (not the last)
    const model = wrapAnthropicPromptCacheModel(new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        const prompt = options.prompt;

        // System message should be cached (not last)
        expect(prompt[0]).toMatchObject({
          role: 'system',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral', ttl: '1h' },
            },
          },
        });

        // User message (last) should NOT be cached
        expect(prompt[1]).toMatchObject({
          role: 'user',
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
      messages: [
        { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      ],
    });
  });

  it('preserves existing cache control and adds to messages without it', async () => {
    // System has existing cache with 30m ttl - should preserve it
    // Assistant at index 1 should get cache control (not last)
    // Assistant at index 2 is last, should NOT get cache control
    const model = wrapAnthropicPromptCacheModel(new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        const prompt = options.prompt;

        // System message should keep its original ttl (30m), not 1h
        expect(prompt[0]).toMatchObject({
          role: 'system',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral', ttl: '30m' },
            },
          },
        });

        // Assistant at index 1 should get cache control added
        expect(prompt[1]).toMatchObject({
          role: 'assistant',
          providerOptions: {
            anthropic: {
              cacheControl: { type: 'ephemeral', ttl: '1h' },
            },
          },
        });

        // Assistant at index 2 is LAST - should NOT get cache control
        expect(prompt[2]).toMatchObject({
          role: 'assistant',
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
