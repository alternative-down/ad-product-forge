import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { FilesystemConversationStore } from '../integrations/conversations/filesystem-conversation-store.js';
import { InMemoryConversationStore } from '../integrations/conversations/in-memory-conversation-store.js';
import { createConversationRuntimeInputPayload } from '../integrations/conversations/runtime-input.js';

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    tempPaths.splice(0).map((tempPath) => {
      return rm(tempPath, { recursive: true, force: true });
    }),
  );
});

describe('conversation stores', () => {
  it('stores threads and messages in memory', async () => {
    const store = new InMemoryConversationStore();

    await store.upsertThread({
      id: 'thread-1',
      title: 'General',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await store.appendMessage({
      id: 'message-1',
      threadId: 'thread-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
      createdAt: '2026-01-01T00:00:01.000Z',
    });

    expect(await store.getThread('thread-1')).not.toBeNull();
    expect(await store.listMessages({ threadId: 'thread-1' })).toHaveLength(1);
  });

  it('persists conversations to the filesystem', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-runtime-core-conversations-'));
    const filePath = path.join(tempDir, 'conversations.json');

    tempPaths.push(tempDir);

    const store = new FilesystemConversationStore({ filePath });

    await store.upsertThread({
      id: 'thread-1',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    await store.appendMessage({
      id: 'message-1',
      threadId: 'thread-1',
      role: 'user',
      parts: [
        {
          type: 'image',
          mimeType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
      createdAt: '2026-01-01T00:00:01.000Z',
    });

    const persistedStore = new FilesystemConversationStore({ filePath });
    const [message] = await persistedStore.listMessages({ threadId: 'thread-1' });

    expect(message?.parts[0]).toEqual({
      type: 'image',
      mimeType: 'image/png',
      bytes: new Uint8Array([1, 2, 3]),
    });
  });
});

describe('createConversationRuntimeInputPayload', () => {
  it('creates a validated runtime payload for conversation messages', () => {
    const payload = createConversationRuntimeInputPayload({
      threadId: 'thread-1',
      messageId: 'message-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    });

    expect(payload.threadId).toBe('thread-1');
    expect(payload.parts).toHaveLength(1);
  });
});
