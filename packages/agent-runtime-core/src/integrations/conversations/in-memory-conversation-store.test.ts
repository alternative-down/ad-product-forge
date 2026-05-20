/**
 * Unit tests for agent-runtime-core/integrations/conversations/in-memory-conversation-store.ts.
 * InMemoryConversationStore — pure in-memory implementation of ConversationStore.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import type {
  ConversationMessage,
  ConversationMessagePart,
  ConversationMessageListQuery,
  ConversationThread,
} from './contracts.js';
import { InMemoryConversationStore } from './in-memory-conversation-store.js';

// ─── Fixtures ────────────────────────────────────────────────────────────────

function makePart(text: string): ConversationMessagePart {
  return { type: 'text', text };
}

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: 'msg-1',
    threadId: 'thread-1',
    role: 'user',
    parts: [makePart('hello')],
    createdAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeThread(overrides: Partial<ConversationThread> = {}): ConversationThread {
  return {
    id: 'thread-1',
    title: 'Test Thread',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  };
}

// ─── Thread operations ───────────────────────────────────────────────────────

describe('upsertThread + getThread', () => {
  it('returns null for non-existent thread', async () => {
    const store = new InMemoryConversationStore();
    const result = await store.getThread('non-existent');
    expect(result).toBeNull();
  });

  it('stores and retrieves a thread', async () => {
    const store = new InMemoryConversationStore();
    const thread = makeThread({ id: 'thread-x', title: 'My Thread' });

    await store.upsertThread(thread);
    const result = await store.getThread('thread-x');

    expect(result).toMatchObject({ id: 'thread-x', title: 'My Thread' });
  });

  it('overwrites existing thread on upsert', async () => {
    const store = new InMemoryConversationStore();
    await store.upsertThread(makeThread({ id: 'thread-x', title: 'Old Title' }));
    await store.upsertThread(makeThread({ id: 'thread-x', title: 'New Title' }));

    const result = await store.getThread('thread-x');
    expect((result as ConversationThread).title).toBe('New Title');
  });
});

describe('listThreads', () => {
  it('returns empty array when no threads', async () => {
    const store = new InMemoryConversationStore();
    const result = await store.listThreads();
    expect(result).toEqual([]);
  });

  it('returns threads sorted by updatedAt descending', async () => {
    const store = new InMemoryConversationStore();
    await store.upsertThread(makeThread({ id: 't1', updatedAt: '2025-01-01T00:00:00.000Z' }));
    await store.upsertThread(makeThread({ id: 't2', updatedAt: '2025-01-03T00:00:00.000Z' }));
    await store.upsertThread(makeThread({ id: 't3', updatedAt: '2025-01-02T00:00:00.000Z' }));

    const result = await store.listThreads();

    expect(result.map((t) => t.id)).toEqual(['t2', 't3', 't1']);
  });
});

// ─── Message operations ──────────────────────────────────────────────────────

describe('appendMessage', () => {
  it('appends message to thread', async () => {
    const store = new InMemoryConversationStore();
    const msg = makeMessage({ id: 'msg-a', threadId: 'thread-1', role: 'user' });

    await store.appendMessage(msg);

    const messages = await store.listMessages({ threadId: 'thread-1' });
    expect(messages).toHaveLength(1);
    expect(messages[0].id).toBe('msg-a');
  });

  it('appends multiple messages in order', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(makeMessage({ id: 'msg-1', parts: [makePart('first')] }));
    await store.appendMessage(makeMessage({ id: 'msg-2', parts: [makePart('second')] }));

    const messages = await store.listMessages({ threadId: 'thread-1' });
    expect(messages.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
  });

  it('append does not affect other threads', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(makeMessage({ id: 'msg-1', threadId: 'thread-1' }));
    await store.appendMessage(makeMessage({ id: 'msg-2', threadId: 'thread-2' }));

    const thread1Messages = await store.listMessages({ threadId: 'thread-1' });
    const thread2Messages = await store.listMessages({ threadId: 'thread-2' });

    expect(thread1Messages).toHaveLength(1);
    expect(thread2Messages).toHaveLength(1);
  });
});

// ─── updateMessage ───────────────────────────────────────────────────────────

describe('updateMessage', () => {
  it('updates message role', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(makeMessage({ id: 'msg-1', role: 'user' }));
    await store.updateMessage({ threadId: 'thread-1', messageId: 'msg-1', role: 'assistant' });

    const messages = await store.listMessages({ threadId: 'thread-1' });
    expect(messages[0].role).toBe('assistant');
  });

  it('updates message parts', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(makeMessage({ id: 'msg-1', parts: [makePart('old')] }));
    await store.updateMessage({
      threadId: 'thread-1',
      messageId: 'msg-1',
      parts: [makePart('new content')],
    });

    const messages = await store.listMessages({ threadId: 'thread-1' });
    expect((messages[0].parts[0] as { type: string; text: string }).text).toBe('new content');
  });

  it('updates message metadata', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(makeMessage({ id: 'msg-1' }));
    await store.updateMessage({
      threadId: 'thread-1',
      messageId: 'msg-1',
      metadata: { key: 'value' },
    });

    const messages = await store.listMessages({ threadId: 'thread-1' });
    expect(messages[0].metadata).toEqual({ key: 'value' });
  });

  it('silently no-ops when message does not exist', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(makeMessage({ id: 'msg-1' }));

    await store.updateMessage({
      threadId: 'thread-1',
      messageId: 'non-existent',
      role: 'assistant',
    });

    const messages = await store.listMessages({ threadId: 'thread-1' });
    expect(messages[0].role).toBe('user'); // unchanged
  });

  it('silently no-ops when thread does not exist', async () => {
    const store = new InMemoryConversationStore();

    await expect(
      store.updateMessage({ threadId: 'non-existent', messageId: 'msg-1', role: 'assistant' }),
    ).resolves.toBeUndefined();
  });
});

describe('updateMessageMetadata', () => {
  it('replaces entire metadata', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(makeMessage({ id: 'msg-1', metadata: { old: 'value' } }));
    await store.updateMessageMetadata({
      threadId: 'thread-1',
      messageId: 'msg-1',
      metadata: { new: 'data' },
    });

    const messages = await store.listMessages({ threadId: 'thread-1' });
    expect(messages[0].metadata).toEqual({ new: 'data' });
  });

  it('sets metadata to undefined when metadata is undefined', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(makeMessage({ id: 'msg-1', metadata: { key: 'val' } }));
    await store.updateMessageMetadata({
      threadId: 'thread-1',
      messageId: 'msg-1',
      metadata: undefined,
    });

    const messages = await store.listMessages({ threadId: 'thread-1' });
    expect(messages[0].metadata).toBeUndefined();
  });
});

describe('updateMessageReplacement', () => {
  it('sets replacedByMessageId', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(makeMessage({ id: 'msg-1' }));
    await store.appendMessage(makeMessage({ id: 'msg-2' }));
    await store.updateMessageReplacement({
      threadId: 'thread-1',
      messageId: 'msg-1',
      replacedByMessageId: 'msg-2',
    });

    const messages = await store.listMessages({ threadId: 'thread-1' });
    expect(messages[0].replacedByMessageId).toBe('msg-2');
  });

  it('can set replacedByMessageId to null', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(makeMessage({ id: 'msg-1', replacedByMessageId: 'msg-old' }));
    await store.updateMessageReplacement({
      threadId: 'thread-1',
      messageId: 'msg-1',
      replacedByMessageId: null,
    });

    const messages = await store.listMessages({ threadId: 'thread-1' });
    expect(messages[0].replacedByMessageId).toBeNull();
  });
});

// ─── listMessages ─────────────────────────────────────────────────────────────

describe('listMessages', () => {
  async function storeWithMessages(
    ...ids: Array<{ id: string; createdAt?: string }>
  ): Promise<InMemoryConversationStore> {
    const store = new InMemoryConversationStore();
    for (const { id, createdAt } of ids) {
      await store.appendMessage(
        makeMessage({ id, createdAt: createdAt ?? '2025-01-01T00:00:00.000Z' }),
      );
    }
    return store;
  }

  it('returns all messages for thread', async () => {
    const store = await storeWithMessages({ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' });
    const result = await store.listMessages({ threadId: 'thread-1' });
    expect(result).toHaveLength(3);
  });

  it('returns empty array for non-existent thread', async () => {
    const store = new InMemoryConversationStore();
    const result = await store.listMessages({ threadId: 'non-existent' });
    expect(result).toEqual([]);
  });

  it('respects limit', async () => {
    const store = await storeWithMessages({ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' });
    const result = await store.listMessages({ threadId: 'thread-1', limit: 2 });
    expect(result).toHaveLength(2);
  });

  it('defaults to asc order (oldest first)', async () => {
    const store = await storeWithMessages({ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' });
    const result = await store.listMessages({ threadId: 'thread-1' });
    expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-2', 'msg-3']);
  });

  it('respects order desc (newest first)', async () => {
    const store = await storeWithMessages(
      { id: 'msg-1', createdAt: '2025-01-01T00:00:00.000Z' },
      { id: 'msg-2', createdAt: '2025-01-02T00:00:00.000Z' },
      { id: 'msg-3', createdAt: '2025-01-03T00:00:00.000Z' },
    );
    const result = await store.listMessages({ threadId: 'thread-1', order: 'desc' });
    expect(result.map((m) => m.id)).toEqual(['msg-3', 'msg-2', 'msg-1']);
  });

  it('applies afterMessageId cursor (skip messages before cursor)', async () => {
    const store = await storeWithMessages({ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' });
    const result = await store.listMessages({ threadId: 'thread-1', afterMessageId: 'msg-1' });
    expect(result.map((m) => m.id)).toEqual(['msg-2', 'msg-3']);
  });

  it('applies beforeMessageId cursor (skip messages after cursor)', async () => {
    const store = await storeWithMessages({ id: 'msg-1' }, { id: 'msg-2' }, { id: 'msg-3' });
    const result = await store.listMessages({ threadId: 'thread-1', beforeMessageId: 'msg-3' });
    expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
  });

  it('combines afterMessageId + beforeMessageId', async () => {
    const store = await storeWithMessages(
      { id: 'msg-1' },
      { id: 'msg-2' },
      { id: 'msg-3' },
      { id: 'msg-4' },
    );
    const result = await store.listMessages({
      threadId: 'thread-1',
      afterMessageId: 'msg-1',
      beforeMessageId: 'msg-4',
    });
    expect(result.map((m) => m.id)).toEqual(['msg-2', 'msg-3']);
  });

  it('applies limit on desc order', async () => {
    const store = await storeWithMessages(
      { id: 'msg-1', createdAt: '2025-01-01T00:00:00.000Z' },
      { id: 'msg-2', createdAt: '2025-01-02T00:00:00.000Z' },
      { id: 'msg-3', createdAt: '2025-01-03T00:00:00.000Z' },
    );
    const result = await store.listMessages({ threadId: 'thread-1', order: 'desc', limit: 2 });
    expect(result.map((m) => m.id)).toEqual(['msg-3', 'msg-2']);
  });
});

// ─── listOperationalMemoryMessages ────────────────────────────────────────────

describe('listOperationalMemoryMessages', () => {
  function checkpointMessage(id: string, generation?: number): ConversationMessage {
    return makeMessage({
      id,
      role: 'assistant',
      parts: [makePart('checkpoint')],
      operationalMemoryType: 'checkpoint-summary',
      operationalMemoryGeneration: generation ?? 1,
    });
  }

  function regularMessage(id: string): ConversationMessage {
    return makeMessage({ id, role: 'user', parts: [makePart('regular')] });
  }

  function replacedMessage(id: string, replacedBy: string): ConversationMessage {
    return makeMessage({
      id,
      role: 'assistant',
      parts: [makePart('old')],
      replacedByMessageId: replacedBy,
    });
  }

  it('returns all messages when no checkpoint exists', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(regularMessage('msg-1'));
    await store.appendMessage(regularMessage('msg-2'));

    const result = await store.listOperationalMemoryMessages({ threadId: 'thread-1' });
    expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
  });

  it('returns only messages from checkpoint onwards when checkpoint exists', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(regularMessage('msg-1'));
    await store.appendMessage(checkpointMessage('msg-2'));
    await store.appendMessage(regularMessage('msg-3'));

    const result = await store.listOperationalMemoryMessages({ threadId: 'thread-1' });
    expect(result.map((m) => m.id)).toEqual(['msg-2', 'msg-3']);
  });

  it('skips messages replaced by later messages', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(regularMessage('msg-1'));
    await store.appendMessage(replacedMessage('msg-2', 'msg-3'));
    await store.appendMessage(regularMessage('msg-3'));

    const result = await store.listOperationalMemoryMessages({ threadId: 'thread-1' });
    expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-3']);
  });

  it('handles cycle in replacement chain (visitedIds detection)', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(replacedMessage('msg-1', 'msg-2'));
    await store.appendMessage(replacedMessage('msg-2', 'msg-1')); // cycle

    const result = await store.listOperationalMemoryMessages({ threadId: 'thread-1' });
    // Cycle: msg-1 → msg-2 → msg-1 detected → returns msg-1; msg-2 → msg-1 → msg-2 detected → returns msg-2
    expect(result.map((m) => m.id)).toEqual(['msg-1', 'msg-2']);
  });

  it('returns empty array for non-existent thread', async () => {
    const store = new InMemoryConversationStore();
    const result = await store.listOperationalMemoryMessages({ threadId: 'non-existent' });
    expect(result).toEqual([]);
  });

  it('skips replaced checkpoint messages', async () => {
    const store = new InMemoryConversationStore();
    await store.appendMessage(checkpointMessage('msg-1'));
    await store.appendMessage(replacedMessage('msg-1', 'msg-2'));
    await store.appendMessage(checkpointMessage('msg-2'));

    const result = await store.listOperationalMemoryMessages({ threadId: 'thread-1' });
    expect(result.map((m) => m.id)).toContain('msg-2');
  });
});
