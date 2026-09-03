import {
  InMemoryConversationStore,
  type ConversationMessage,
  type ConversationStore,
} from 'agent-runtime-core/integrations';
import { createClient } from '@libsql/client';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';

import { createForgeConversationMemory } from './memory.js';
import { consolidateOperationalMemory } from './operational-memory-consolidation.js';
import { LibsqlConversationStore } from './libsql-conversation-store.js';

const limits = {
  totalContextTokens: 5,
  recentRawTokens: 1,
  rawObservationBatchTokens: 1,
  observationReflectionBatchTokens: 1,
  observationSupportTokens: 0,
  reflectionSupportTokens: 0,
};

const overlappingLimits = {
  totalContextTokens: 5,
  recentRawTokens: 10,
  rawObservationBatchTokens: 5,
  observationReflectionBatchTokens: 5,
  observationSupportTokens: 0,
  reflectionSupportTokens: 0,
};

function createModel() {
  let generation = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => ({
      content: [
        {
          type: 'text',
          text: `<observations>consolidated ${++generation}</observations>`,
        },
      ],
      finishReason: { raw: 'stop', unified: 'stop' },
      usage: {
        inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: 1, text: 1, reasoning: 0 },
      },
      warnings: [],
    }),
  });
}

async function append(store: ConversationStore, messages: ConversationMessage[]) {
  for (const message of messages) await store.appendMessage(message);
}

describe('consolidateOperationalMemory', () => {
  it('keeps a new reflection active until the reflection budget is reached', async () => {
    const store = new InMemoryConversationStore();
    await append(store, [
      memoryMessage('observation-1', 'one two three four five six', 'observation'),
    ]);

    await consolidateOperationalMemory({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      store,
      limits: overlappingLimits,
      model: createModel(),
    });

    const active = await store.listOperationalMemoryMessages({ threadId: 'thread-1' });
    expect(active.map((message) => message.operationalMemoryType)).toEqual(['reflection']);
  });

  it('creates a checkpoint after accumulated reflections reach the budget', async () => {
    const store = new InMemoryConversationStore();
    await append(store, [
      memoryMessage('reflection-1', 'one two three four five six', 'reflection'),
    ]);

    await consolidateOperationalMemory({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      store,
      limits: overlappingLimits,
      model: createModel(),
    });

    const active = await store.listOperationalMemoryMessages({ threadId: 'thread-1' });
    expect(active.map((message) => message.operationalMemoryType)).toEqual([
      'checkpoint-summary',
    ]);
  });

  it('projects observations into a reflection and reflections into a checkpoint', async () => {
    const store = new InMemoryConversationStore();
    await append(store, [
      memoryMessage('observation-1', 'observation one', 'observation'),
      memoryMessage('observation-2', 'observation two', 'observation'),
    ]);

    await consolidateOperationalMemory({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      store,
      limits,
      model: createModel(),
    });

    const active = await store.listOperationalMemoryMessages({ threadId: 'thread-1' });
    expect(active.map((message) => message.operationalMemoryType)).toEqual(['checkpoint-summary']);
    expect(active[0]?.operationalMemoryGeneration).toBe(2);

    const persistedMessages = await store.listMessages({ threadId: 'thread-1', order: 'asc' });
    const reflection = persistedMessages.find((message) => message.id === 'reflection:2');
    expect(reflection?.createdAt).toBe('2026-09-01T00:00:02.000Z');
  });

  it('replaces the previous checkpoint and renders only the latest summary plus recent raw', async () => {
    const store = new InMemoryConversationStore();
    await append(store, [
      { ...memoryMessage('checkpoint-summary:1', 'old summary', 'checkpoint-summary'), operationalMemoryGeneration: 1 },
      { ...memoryMessage('reflection:2', 'new reflection', 'reflection'), operationalMemoryGeneration: 2 },
      rawMessage('old-raw', 'old raw content '.repeat(20)),
      rawMessage('recent-raw', 'recent'),
    ]);

    await consolidateOperationalMemory({
      threadId: 'thread-1',
      resourceId: 'resource-1',
      store,
      limits,
      model: createModel(),
    });
    const memory = createForgeConversationMemory({
      threadId: 'thread-1',
      conversationStore: store,
      recentTokenLimit: 5,
      overflowObservationTokenLimit: 1,
    });
    const rendered = await memory.memory.renderActiveMessages();

    expect(rendered.map((message) => message.id)).toEqual([
      'checkpoint-summary:2',
      'recent-raw',
    ]);
    expect(rendered.map((message) => message.id)).not.toContain('checkpoint-summary:1');
    expect(rendered.map((message) => message.id)).not.toContain('old-raw');
  });

  it('reuses a checkpoint generation when a retry finds its deterministic id', async () => {
    const client = createClient({ url: 'file::memory:' });
    const store = new LibsqlConversationStore({ client, tablePrefix: 'retry_checkpoint' });

    try {
      await append(store, [
        {
          ...memoryMessage('checkpoint-summary:2', 'incomplete summary', 'checkpoint-summary'),
          operationalMemoryGeneration: 2,
        },
        {
          ...memoryMessage('reflection:2', 'reflection awaiting retry', 'reflection'),
          operationalMemoryGeneration: 2,
        },
      ]);

      await expect(
        consolidateOperationalMemory({
          threadId: 'thread-1',
          resourceId: 'resource-1',
          store,
          limits,
          model: createModel(),
        }),
      ).resolves.toBeUndefined();

      const active = await store.listOperationalMemoryMessages({ threadId: 'thread-1' });
      expect(active).toHaveLength(1);
      expect(active[0]?.id).toBe('checkpoint-summary:2');
      expect(active[0]?.parts).toEqual([{ type: 'text', text: 'consolidated 1' }]);
    } finally {
      client.close();
    }
  });
});

function memoryMessage(
  id: string,
  text: string,
  operationalMemoryType: 'observation' | 'reflection' | 'checkpoint-summary',
): ConversationMessage {
  return {
    id,
    threadId: 'thread-1',
    role: 'assistant',
    parts: [{ type: 'text', text }],
    operationalMemoryType,
    createdAt: `2026-09-01T00:00:0${id.endsWith('2') ? '2' : '1'}.000Z`,
  };
}

function rawMessage(id: string, text: string): ConversationMessage {
  return {
    id,
    threadId: 'thread-1',
    role: id === 'old-raw' ? 'user' : 'assistant',
    parts: [{ type: 'text', text }],
    createdAt: id === 'old-raw' ? '2026-09-01T00:00:03.000Z' : '2026-09-01T00:00:04.000Z',
  };
}
