import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';

import { InMemoryConversationStore, type ConversationMessage } from 'agent-runtime-core/integrations';

import { syncOperationalMemoryOmCompatibility } from './operational-memory-om-compatibility.js';

async function appendMessages(store: InMemoryConversationStore, messages: ConversationMessage[]) {
  for (const message of messages) {
    await store.appendMessage(message);
  }
}

describe('syncOperationalMemoryOmCompatibility', () => {
  it('creates a reflection message from active observation messages and replaces the source observations', async () => {
    const store = new InMemoryConversationStore();
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: '<observations>condensed reflection</observations>' }],
        finishReason: { raw: 'stop', unified: 'stop' },
        usage: {
          inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 6, text: 6, reasoning: 0 },
        },
        warnings: [],
      }),
    });

    await appendMessages(store, [
      {
        id: 'observation-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'first observation' }],
        operationalMemoryType: 'observation',
        createdAt: '2026-04-24T00:00:00.000Z',
      },
      {
        id: 'observation-2',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'second observation' }],
        operationalMemoryType: 'observation',
        createdAt: '2026-04-24T00:00:01.000Z',
      },
    ]);

    await syncOperationalMemoryOmCompatibility({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      conversationStore: store,
      limits: {
        totalContextTokens: 50_000,
        recentRawTokens: 10_000,
        rawObservationBatchTokens: 5_000,
        observationReflectionBatchTokens: 1,
        observationSupportTokens: 2_000,
        reflectionSupportTokens: 2_000,
      },
      reflectionModel: model,
    });

    const messages = await store.listMessages({
      threadId: 'thread-1',
      order: 'asc',
    });
    const reflectionMessage = messages.find((message) => message.operationalMemoryType === 'reflection');

    expect(reflectionMessage?.parts).toEqual([{
      type: 'text',
      text: 'condensed reflection',
    }]);
    expect(messages.filter((message) => message.replacedByMessageId === reflectionMessage?.id)).toHaveLength(1);
  });

  it('creates a checkpoint summary message from active reflection messages and replaces the source reflections', async () => {
    const store = new InMemoryConversationStore();
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: '<observations>checkpoint summary</observations>' }],
        finishReason: { raw: 'stop', unified: 'stop' },
        usage: {
          inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 6, text: 6, reasoning: 0 },
        },
        warnings: [],
      }),
    });

    await appendMessages(store, [
      {
        id: 'reflection-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'first reflection' }],
        operationalMemoryType: 'reflection',
        operationalMemoryGeneration: 1,
        createdAt: '2026-04-24T00:00:00.000Z',
      },
      {
        id: 'reflection-2',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'second reflection' }],
        operationalMemoryType: 'reflection',
        operationalMemoryGeneration: 2,
        createdAt: '2026-04-24T00:00:01.000Z',
      },
    ]);

    await syncOperationalMemoryOmCompatibility({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      conversationStore: store,
      limits: {
        totalContextTokens: 2,
        recentRawTokens: 0,
        rawObservationBatchTokens: 0,
        observationReflectionBatchTokens: 1,
        observationSupportTokens: 0,
        reflectionSupportTokens: 0,
      },
      reflectionModel: model,
    });

    const messages = await store.listMessages({
      threadId: 'thread-1',
      order: 'asc',
    });
    const checkpointMessage = messages.find((message) => message.operationalMemoryType === 'checkpoint-summary');

    expect(checkpointMessage?.parts).toEqual([{
      type: 'text',
      text: 'checkpoint summary',
    }]);
    expect(messages.filter((message) => message.replacedByMessageId === checkpointMessage?.id)).toHaveLength(1);
  });

  it('uses the highest persisted operational memory generation for new reflections', async () => {
    const store = new InMemoryConversationStore();
    const model = new MockLanguageModelV3({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'next reflection' }],
        finishReason: { raw: 'stop', unified: 'stop' },
        usage: {
          inputTokens: { total: 12, noCache: 12, cacheRead: 0, cacheWrite: 0 },
          outputTokens: { total: 6, text: 6, reasoning: 0 },
        },
        warnings: [],
      }),
    });

    await appendMessages(store, [
      {
        id: 'reflection-legacy-12',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'older reflection' }],
        operationalMemoryType: 'reflection',
        operationalMemoryGeneration: 12,
        createdAt: '2026-04-24T00:00:00.000Z',
      },
      {
        id: 'checkpoint-summary:11',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'checkpoint summary' }],
        operationalMemoryType: 'checkpoint-summary',
        operationalMemoryGeneration: 11,
        createdAt: '2026-04-24T00:00:01.000Z',
      },
      {
        id: 'observation-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'first observation' }],
        operationalMemoryType: 'observation',
        createdAt: '2026-04-24T00:00:02.000Z',
      },
      {
        id: 'observation-2',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'second observation' }],
        operationalMemoryType: 'observation',
        createdAt: '2026-04-24T00:00:03.000Z',
      },
    ]);

    await syncOperationalMemoryOmCompatibility({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      conversationStore: store,
      limits: {
        totalContextTokens: 50_000,
        recentRawTokens: 10_000,
        rawObservationBatchTokens: 5_000,
        observationReflectionBatchTokens: 1,
        observationSupportTokens: 2_000,
        reflectionSupportTokens: 2_000,
      },
      reflectionModel: model,
    });

    const messages = await store.listMessages({
      threadId: 'thread-1',
      order: 'asc',
    });
    const newReflectionMessage = messages.find((message) => message.id === 'reflection:13');

    expect(newReflectionMessage?.operationalMemoryGeneration).toBe(13);
    expect(messages.some((message) => message.id === 'reflection:12')).toBe(false);
  });
});
