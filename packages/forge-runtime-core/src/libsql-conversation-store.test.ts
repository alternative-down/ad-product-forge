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
          overflowMessageCount: 0,
          observationCount: 0,
          totalActiveMessageCount: 1,
        },
        updatedAt: '2026-04-21T00:00:03.000Z',
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
          overflowMessageCount: 0,
          observationCount: 0,
          totalActiveMessageCount: 1,
        },
        updatedAt: '2026-04-21T00:00:03.000Z',
      });
    } finally {
      await client.close();
    }
  });
});
