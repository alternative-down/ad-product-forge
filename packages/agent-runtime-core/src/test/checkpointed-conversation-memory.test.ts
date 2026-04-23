import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryConversationStore } from '../integrations/conversations/in-memory-conversation-store.js';
import { CheckpointedConversationMemory } from '../integrations/memory/checkpointed-conversation-memory.js';
import { InMemoryCheckpointedConversationStateStore } from '../integrations/memory/checkpointed-conversation-state-store.js';
import { FilesystemCheckpointedConversationStateStore } from '../integrations/persistence/filesystem-checkpointed-conversation-state-store.js';

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
      recentTokenLimit: 2,
      overflowObservationTokenLimit: 10,
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
    expect(context).toHaveLength(1);
    expect(context[0]?.id).toContain('message-3');
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
        recentTokenCount: 0,
        overflowMessageCount: 0,
        overflowTokenCount: 0,
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

  it('uses token budgets for recent raw, observation batches, and visible observations', async () => {
    const store = new InMemoryConversationStore();

    for (const message of [
      createMessage('message-1', '11111111111111111111'),
      createMessage('message-2', '22222222222222222222'),
      createMessage('message-3', '33333333333333333333'),
    ]) {
      await store.appendMessage(message);
    }

    const memory = new CheckpointedConversationMemory({
      threadId: 'thread-1',
      store,
      stateStore: new InMemoryCheckpointedConversationStateStore(),
      recentTokenLimit: 5,
      overflowObservationTokenLimit: 5,
      observationTokenLimit: 5,
      observer: {
        async observe(request) {
          return {
            text: request.messages.map((message) => getText(message)).join(' | '),
          };
        },
      },
    });

    let state = await memory.getState();
    expect(state.recentMessageIds).toEqual(['message-3']);
    expect(state.overflowMessageIds).toEqual(['message-1', 'message-2']);

    await memory.stabilize();
    state = await memory.getState();

    expect(state.checkpointMessageId).toBe('message-2');
    expect(state.recentMessageIds).toEqual(['message-3']);
    expect(state.overflowMessageIds).toEqual([]);
    expect(state.observations).toHaveLength(2);

    const context = await memory.renderContext();

    expect(context).toHaveLength(1);
    expect(context[0]?.id).toContain('message-3');
  });

  it('counts tool results in recent and overflow token budgets', async () => {
    const store = new InMemoryConversationStore();

    await store.appendMessage({
      id: 'assistant-tool-call',
      threadId: 'thread-1',
      role: 'assistant',
      parts: [],
      metadata: {
        toolInvocations: [{
          toolCallId: 'call-1',
          toolName: 'workspace_execute_command',
          args: {
            command: 'cat README.md',
          },
        }],
      },
      createdAt: '2026-01-01T00:00:01.000Z',
    });
    await store.appendMessage({
      id: 'tool-result',
      threadId: 'thread-1',
      role: 'tool',
      parts: [],
      metadata: {
        toolResults: [{
          toolCallId: 'call-1',
          toolName: 'workspace_execute_command',
          result: {
            stdout: 'x'.repeat(200),
          },
        }],
      },
      createdAt: '2026-01-01T00:00:02.000Z',
    });
    await store.appendMessage(createMessage('message-3', 'tail'));

    const memory = new CheckpointedConversationMemory({
      threadId: 'thread-1',
      store,
      stateStore: new InMemoryCheckpointedConversationStateStore(),
      recentTokenLimit: 20,
      overflowObservationTokenLimit: 20,
    });

    const state = await memory.getState();

    expect(state.overflowMessageIds).toContain('tool-result');
    expect(state.metrics.overflowTokenCount).toBeGreaterThan(20);
    expect(state.metrics.recentTokenCount).toBeLessThanOrEqual(20);
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
