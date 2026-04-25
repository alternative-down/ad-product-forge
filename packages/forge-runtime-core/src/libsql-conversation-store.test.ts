import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createClient } from '@libsql/client';
import { afterEach, describe, expect, it } from 'vitest';

import { LibsqlConversationStore } from './libsql-conversation-store.js';

const tempDirectories: string[] = [];

afterEach(async () => {
  while (tempDirectories.length > 0) {
    const directoryPath = tempDirectories.pop();

    if (directoryPath) {
      await rm(directoryPath, { recursive: true, force: true });
    }
  }
});

describe('LibsqlConversationStore', () => {
  it('persists threads, messages, and checkpointed state', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runtime-core-'));
    const databasePath = path.join(directoryPath, 'conversation.db');
    tempDirectories.push(directoryPath);
    const client = createClient({
      url: `file:${databasePath}`,
    });
    const store = new LibsqlConversationStore({
      client,
      tablePrefix: 'test_runtime',
    });

    try {
      await store.upsertThread({
        id: 'thread-1',
        title: 'General',
        participantIds: ['agent-a', 'user-b'],
        metadata: {
          source: 'test',
        },
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:00.000Z',
      });
      await store.appendMessage({
        id: 'message-1',
        threadId: 'thread-1',
        role: 'user',
        authorId: 'user-b',
        parts: [
          {
            type: 'text',
            text: 'hello',
          },
        ],
        metadata: {
          kind: 'chat',
        },
        createdAt: '2026-04-21T00:00:01.000Z',
      });
      await store.appendMessage({
        id: 'message-2',
        threadId: 'thread-1',
        role: 'assistant',
        authorId: 'agent-a',
        parts: [
          {
            type: 'text',
            text: 'world',
          },
        ],
        createdAt: '2026-04-21T00:00:02.000Z',
      });
      await store.save({
        threadId: 'thread-1',
        checkpointMessageId: 'message-1',
        recentMessageIds: ['message-2'],
        overflowMessageIds: [],
        observations: [],
        metrics: {
          recentMessageCount: 1,
          recentTokenCount: 1,
          overflowMessageCount: 0,
          overflowTokenCount: 0,
          observationCount: 0,
          totalActiveMessageCount: 1,
        },
        updatedAt: '2026-04-21T00:00:03.000Z',
      });
      await store.write({
        threadId: 'thread-1',
        resourceId: 'thread-1',
        workingMemory: '{"identity":{"roleCore":"test"}}',
        updatedAt: '2026-04-21T00:00:04.000Z',
      });

      await expect(store.getThread('thread-1')).resolves.toEqual({
        id: 'thread-1',
        title: 'General',
        participantIds: ['agent-a', 'user-b'],
        metadata: {
          source: 'test',
        },
        createdAt: '2026-04-21T00:00:00.000Z',
        updatedAt: '2026-04-21T00:00:02.000Z',
      });
      await expect(store.listMessages({
        threadId: 'thread-1',
      })).resolves.toEqual([
        {
          id: 'message-1',
          threadId: 'thread-1',
          role: 'user',
          authorId: 'user-b',
          parts: [
            {
              type: 'text',
              text: 'hello',
            },
          ],
          metadata: {
            kind: 'chat',
          },
          replacedByMessageId: null,
          operationalMemoryType: undefined,
          operationalMemoryGeneration: null,
          createdAt: '2026-04-21T00:00:01.000Z',
        },
        {
          id: 'message-2',
          threadId: 'thread-1',
          role: 'assistant',
          authorId: 'agent-a',
          parts: [
            {
              type: 'text',
              text: 'world',
            },
          ],
          metadata: undefined,
          replacedByMessageId: null,
          operationalMemoryType: undefined,
          operationalMemoryGeneration: null,
          createdAt: '2026-04-21T00:00:02.000Z',
        },
      ]);
      await expect(store.load('thread-1')).resolves.toEqual({
        threadId: 'thread-1',
        checkpointMessageId: 'message-1',
        recentMessageIds: ['message-2'],
        overflowMessageIds: [],
        observations: [],
        metrics: {
          recentMessageCount: 1,
          recentTokenCount: 1,
          overflowMessageCount: 0,
          overflowTokenCount: 0,
          observationCount: 0,
          totalActiveMessageCount: 1,
        },
        updatedAt: '2026-04-21T00:00:03.000Z',
      });
      await expect(store.read({
        threadId: 'thread-1',
        resourceId: 'thread-1',
      })).resolves.toEqual({
        threadId: 'thread-1',
        resourceId: 'thread-1',
        workingMemory: '{"identity":{"roleCore":"test"}}',
        updatedAt: '2026-04-21T00:00:04.000Z',
      });
    } finally {
      await client.close();
    }
  });

  it('keeps message ordering stable when multiple messages share the same timestamp', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runtime-core-'));
    const databasePath = path.join(directoryPath, 'conversation.db');
    tempDirectories.push(directoryPath);
    const client = createClient({
      url: `file:${databasePath}`,
    });
    const store = new LibsqlConversationStore({
      client,
      tablePrefix: 'test_runtime_same_timestamp',
    });

    try {
      const createdAt = '2026-04-21T00:00:01.000Z';

      await store.appendMessage({
        id: 'message-1',
        threadId: 'thread-1',
        role: 'user',
        parts: [{ type: 'text', text: 'first' }],
        createdAt,
      });
      await store.appendMessage({
        id: 'message-2',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'second' }],
        createdAt,
      });
      await store.appendMessage({
        id: 'message-3',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'third' }],
        createdAt,
      });

      await expect(store.listMessages({
        threadId: 'thread-1',
      })).resolves.toMatchObject([
        { id: 'message-1' },
        { id: 'message-2' },
        { id: 'message-3' },
      ]);
      await expect(store.listMessages({
        threadId: 'thread-1',
        afterMessageId: 'message-1',
      })).resolves.toMatchObject([
        { id: 'message-2' },
        { id: 'message-3' },
      ]);
      await expect(store.listMessages({
        threadId: 'thread-1',
        beforeMessageId: 'message-3',
      })).resolves.toMatchObject([
        { id: 'message-1' },
        { id: 'message-2' },
      ]);
    } finally {
      await client.close();
    }
  });

  it('supports descending reads and clearing a thread with its persisted state', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runtime-core-'));
    const databasePath = path.join(directoryPath, 'conversation.db');
    tempDirectories.push(directoryPath);
    const client = createClient({
      url: `file:${databasePath}`,
    });
    const store = new LibsqlConversationStore({
      client,
      tablePrefix: 'test_runtime_clear',
    });

    try {
      await store.appendMessage({
        id: 'message-1',
        threadId: 'thread-1',
        role: 'user',
        parts: [{ type: 'text', text: 'first' }],
        createdAt: '2026-04-21T00:00:01.000Z',
      });
      await store.appendMessage({
        id: 'message-2',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'second' }],
        createdAt: '2026-04-21T00:00:02.000Z',
      });
      await store.save({
        threadId: 'thread-1',
        checkpointMessageId: 'message-2',
        recentMessageIds: ['message-2'],
        overflowMessageIds: [],
        observations: [],
        metrics: {
          recentMessageCount: 1,
          recentTokenCount: 1,
          overflowMessageCount: 0,
          overflowTokenCount: 0,
          observationCount: 0,
          totalActiveMessageCount: 1,
        },
        updatedAt: '2026-04-21T00:00:03.000Z',
      });
      await store.write({
        threadId: 'thread-1',
        resourceId: 'thread-1',
        workingMemory: '{"identity":{"roleCore":"test"}}',
        updatedAt: '2026-04-21T00:00:04.000Z',
      });

      await expect(store.listMessages({
        threadId: 'thread-1',
        order: 'desc',
        limit: 2,
      })).resolves.toMatchObject([
        { id: 'message-2' },
        { id: 'message-1' },
      ]);

      await store.clearThread('thread-1');

      await expect(store.listMessages({
        threadId: 'thread-1',
      })).resolves.toEqual([]);
      await expect(store.load('thread-1')).resolves.toBeNull();
      await expect(store.read({
        threadId: 'thread-1',
        resourceId: 'thread-1',
      })).resolves.toBeNull();
      await expect(store.getThread('thread-1')).resolves.toBeNull();
    } finally {
      await client.close();
    }
  });

  it('deduplicates replacement chains to the visible terminal message', async () => {
    const directoryPath = await mkdtemp(path.join(os.tmpdir(), 'forge-runtime-core-'));
    const databasePath = path.join(directoryPath, 'conversation.db');
    tempDirectories.push(directoryPath);
    const client = createClient({
      url: `file:${databasePath}`,
    });
    const store = new LibsqlConversationStore({
      client,
      tablePrefix: 'test_runtime_replacements',
    });

    try {
      await store.appendMessage({
        id: 'raw-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'raw one' }],
        createdAt: '2026-04-21T00:00:01.000Z',
      });
      await store.appendMessage({
        id: 'raw-2',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'raw two' }],
        createdAt: '2026-04-21T00:00:02.000Z',
      });
      await store.appendMessage({
        id: 'observation-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'observation' }],
        operationalMemoryType: 'observation',
        createdAt: '2026-04-21T00:00:03.000Z',
      });
      await store.updateMessageReplacement({
        threadId: 'thread-1',
        messageId: 'raw-1',
        replacedByMessageId: 'observation-1',
      });
      await store.updateMessageReplacement({
        threadId: 'thread-1',
        messageId: 'raw-2',
        replacedByMessageId: 'observation-1',
      });
      await store.appendMessage({
        id: 'reflection-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'reflection' }],
        operationalMemoryType: 'reflection',
        operationalMemoryGeneration: 1,
        createdAt: '2026-04-21T00:00:04.000Z',
      });
      await store.updateMessageReplacement({
        threadId: 'thread-1',
        messageId: 'observation-1',
        replacedByMessageId: 'reflection-1',
      });
      await store.appendMessage({
        id: 'checkpoint-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'checkpoint' }],
        operationalMemoryType: 'checkpoint-summary',
        operationalMemoryGeneration: 1,
        createdAt: '2026-04-21T00:00:05.000Z',
      });
      await store.updateMessageReplacement({
        threadId: 'thread-1',
        messageId: 'reflection-1',
        replacedByMessageId: 'checkpoint-1',
      });

      await expect(store.listOperationalMemoryMessages({
        threadId: 'thread-1',
      })).resolves.toMatchObject([
        { id: 'checkpoint-1' },
      ]);
    } finally {
      await client.close();
    }
  });
});
