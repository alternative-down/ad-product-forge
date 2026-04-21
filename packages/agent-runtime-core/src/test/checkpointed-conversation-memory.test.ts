import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryConversationStore } from '../integrations/conversations/in-memory-conversation-store.js';
import { CheckpointedConversationMemory } from '../integrations/memory/checkpointed-conversation-memory.js';
import { InMemoryCheckpointedConversationStateStore } from '../integrations/memory/checkpointed-conversation-state-store.js';
import { FilesystemCheckpointedConversationStateStore } from '../integrations/persistence/filesystem-checkpointed-conversation-state-store.js';
import { getStepContextText } from '../core/step-context.js';

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => rm(tempPath, { recursive: true, force: true })));
});

describe('CheckpointedConversationMemory', () => {
  it('tracks recent and overflow messages after a checkpoint', async () => {
    const store = new InMemoryConversationStore();

    for (const message of [
      createMessage('message-1', 'one'),
      createMessage('message-2', 'two'),
      createMessage('message-3', 'three'),
    ]) {
      await store.appendMessage(message);
    }

    const memory = new CheckpointedConversationMemory({
      threadId: 'thread-1',
      store,
      stateStore: new InMemoryCheckpointedConversationStateStore(),
      recentMessageLimit: 1,
      observer: {
        async observe(request) {
          return {
            text: request.messages.map((message) => getText(message)).join(' | '),
          };
        },
      },
    });

    await memory.createCheckpoint('message-1');

    let state = await memory.getState();
    expect(state.recentMessageIds).toEqual(['message-3']);
    expect(state.overflowMessageIds).toEqual(['message-2']);

    await memory.consolidateOverflow();

    state = await memory.getState();
    expect(state.checkpointMessageId).toBe('message-2');
    expect(state.observations).toHaveLength(1);
    expect(state.recentMessageIds).toEqual(['message-3']);
    expect(state.overflowMessageIds).toEqual([]);

    const context = await memory.renderContext();
    expect(context).toHaveLength(2);
    expect(getStepContextText(context[0]!)).toContain('two');
    expect(context[1]?.id).toContain('message-3');
  });

  it('persists checkpointed state to the filesystem', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-runtime-core-checkpointed-conversation-'));

    tempPaths.push(tempDir);

    const stateStore = new FilesystemCheckpointedConversationStateStore({
      rootDir: tempDir,
    });

    await stateStore.save({
      threadId: 'thread-1',
      checkpointMessageId: 'message-2',
      recentMessageIds: ['message-3'],
      overflowMessageIds: [],
      observations: [],
      metrics: {
        recentMessageCount: 1,
        overflowMessageCount: 0,
        observationCount: 0,
        totalActiveMessageCount: 1,
      },
      updatedAt: '2026-01-01T00:00:00.000Z',
    });

    expect(await stateStore.load('thread-1')).toMatchObject({
      checkpointMessageId: 'message-2',
      recentMessageIds: ['message-3'],
    });
  });
});

function createMessage(id: string, text: string) {
  return {
    id,
    threadId: 'thread-1',
    role: 'user' as const,
    parts: [{
      type: 'text' as const,
      text,
    }],
    createdAt: `2026-01-01T00:00:0${id.slice(-1)}.000Z`,
  };
}

function getText(message: { parts: Array<{ type: 'text'; text: string } | { type: 'image'; mimeType: string; bytes: Uint8Array } | { type: 'file'; mimeType: string; name: string; bytes: Uint8Array }> }) {
  return message.parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('\n');
}
