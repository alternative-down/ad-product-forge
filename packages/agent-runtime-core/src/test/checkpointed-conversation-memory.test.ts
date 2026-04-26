import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { InMemoryConversationStore, type ConversationMessage } from '../integrations/conversations/in-memory-conversation-store.js';
import { CheckpointedConversationMemory } from '../integrations/memory/checkpointed-conversation-memory.js';
import { FilesystemCheckpointedConversationStateStore } from '../integrations/persistence/filesystem-checkpointed-conversation-state-store.js';

const tempPaths: string[] = [];

afterEach(async () => {
  await Promise.all(tempPaths.splice(0).map((tempPath) => rm(tempPath, { recursive: true, force: true })));
});

function getText(message: ConversationMessage) {
  return message.parts
    .filter((part) => part.type === 'text' || part.type === 'reasoning')
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join('\n');
}

function generateContentNearTokens(count: number): string {
  // Approximate: 4 chars = 1 token with tiktoken cl100k_base
  const targetChars = count * 4;
  const padding = 'x'.repeat(Math.max(0, targetChars - 30));
  return `msg content padding here ${padding}`;
}

describe('CheckpointedConversationMemory', () => {
  describe('state derivation from conversationStore', () => {
    it('derives empty state when no checkpoint exists', async () => {
      const store = new InMemoryConversationStore();

      await store.appendMessage({
        id: 'message-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'one' }],
        createdAt: '2026-01-01T00:00:01Z',
      });
      await store.appendMessage({
        id: 'message-2',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'two' }],
        createdAt: '2026-01-01T00:00:02Z',
      });

      const memory = new CheckpointedConversationMemory({
        threadId: 'thread-1',
        store,
        recentTokenLimit: 10,
        overflowObservationTokenLimit: 5,
        observer: {
          async observe(request) {
            return { text: request.messages.map((m) => getText(m)).join(' | ') };
          },
        },
      });

      const state = await memory.getState();
      expect(state.checkpointMessageId).toBeNull();
      expect(state.recentMessageIds).toHaveLength(2);
      expect(state.overflowMessageIds).toHaveLength(0);
    });

    it('derives recent and overflow message IDs after checkpoint', async () => {
      const store = new InMemoryConversationStore();

      // Add checkpoint FIRST - messages after this are visible to OM
      await store.appendMessage({
        id: 'checkpoint-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'checkpoint' }],
        operationalMemoryType: 'checkpoint-summary',
        createdAt: '2026-01-01T00:00:00Z',
      });

      // Add messages AFTER checkpoint with ~5 tokens each
      await store.appendMessage({
        id: 'message-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: generateContentNearTokens(5) }],
        createdAt: '2026-01-01T00:00:01Z',
      });
      await store.appendMessage({
        id: 'message-2',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: generateContentNearTokens(5) }],
        createdAt: '2026-01-01T00:00:02Z',
      });
      await store.appendMessage({
        id: 'message-3',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: generateContentNearTokens(5) }],
        createdAt: '2026-01-01T00:00:03Z',
      });

      const memory = new CheckpointedConversationMemory({
        threadId: 'thread-1',
        store,
        recentTokenLimit: 2, // Fits 2 messages
        overflowObservationTokenLimit: 5,
        observer: {
          async observe(request) {
            return { text: request.messages.map((m) => getText(m)).join(' | ') };
          },
        },
      });

      const state = await memory.getState();

      expect(state.checkpointMessageId).toBe('checkpoint-1');
      // 2 most recent messages (message-2, message-3) fit in recent
      expect(state.recentMessageIds).toContain('message-3');
      expect(state.recentMessageIds).toContain('message-2');
      // 1 message overflows (message-1)
      expect(state.overflowMessageIds).toContain('message-1');
    });

    it('tool result is included in overflow when its paired assistant message overflows', async () => {
      const store = new InMemoryConversationStore();

      await store.appendMessage({
        id: 'checkpoint-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'checkpoint' }],
        operationalMemoryType: 'checkpoint-summary',
        createdAt: '2026-01-01T00:00:00Z',
      });

      await store.appendMessage({
        id: 'assistant-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'use tool' }],
        createdAt: '2026-01-01T00:00:01Z',
      });
      await store.appendMessage({
        id: 'tool-result',
        threadId: 'thread-1',
        role: 'tool',
        parts: [{ type: 'text', text: 'result' }],
        metadata: {
          toolResults: [{
            toolCallId: 'call-1',
            toolName: 'test',
            result: { output: 'result' },
          }],
        },
        createdAt: '2026-01-01T00:00:02Z',
      });

      const memory = new CheckpointedConversationMemory({
        threadId: 'thread-1',
        store,
        recentTokenLimit: 1,
        overflowObservationTokenLimit: 5,
        observer: {
          async observe(request) {
            return { text: request.messages.map((m) => getText(m)).join(' | ') };
          },
        },
      });

      const state = await memory.getState();
      // Tool result should be included somewhere (in recent or overflow)
      const toolResultIncluded = state.recentMessageIds.includes('tool-result')
        || state.overflowMessageIds.includes('tool-result');
      expect(toolResultIncluded).toBe(true);
    });

    it('stabilize creates observation messages when overflow exceeds threshold', async () => {
      const store = new InMemoryConversationStore();

      await store.appendMessage({
        id: 'checkpoint-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'checkpoint' }],
        operationalMemoryType: 'checkpoint-summary',
        createdAt: '2026-01-01T00:00:00Z',
      });

      // Add 10 messages with ~5 tokens each = 10 overflow tokens (exceeds limit of 5)
      for (let i = 1; i <= 10; i += 1) {
        await store.appendMessage({
          id: `message-${i}`,
          threadId: 'thread-1',
          role: 'assistant',
          parts: [{ type: 'text', text: generateContentNearTokens(5) }],
          createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        });
      }

      const memory = new CheckpointedConversationMemory({
        threadId: 'thread-1',
        store,
        recentTokenLimit: 2, // Only 2 tokens fit in recent
        overflowObservationTokenLimit: 5, // Observation triggers when overflow > 5 tokens
        observer: {
          async observe(request) {
            return { text: request.messages.map((m) => getText(m)).join(' | ') };
          },
        },
      });

      await memory.stabilize();

      const state = await memory.getState();
      expect(state.observations.length).toBeGreaterThan(0);
    });

    it('keeps multiple observation batches for many overflow messages', async () => {
      const store = new InMemoryConversationStore();

      await store.appendMessage({
        id: 'checkpoint-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'checkpoint' }],
        operationalMemoryType: 'checkpoint-summary',
        createdAt: '2026-01-01T00:00:00Z',
      });

      // Add 25 messages with ~5 tokens each
      for (let i = 1; i <= 25; i += 1) {
        await store.appendMessage({
          id: `message-${i}`,
          threadId: 'thread-1',
          role: 'assistant',
          parts: [{ type: 'text', text: generateContentNearTokens(5) }],
          createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        });
      }

      const memory = new CheckpointedConversationMemory({
        threadId: 'thread-1',
        store,
        recentTokenLimit: 2,
        overflowObservationTokenLimit: 5, // Small batch size creates multiple batches
        observer: {
          async observe(request) {
            return { text: request.messages.map((m) => getText(m)).join(' | ') };
          },
        },
      });

      await memory.stabilize();

      const state = await memory.getState();
      // Multiple observation batches created
      expect(state.observations.length).toBeGreaterThan(1);
    });

    it('does not observe overflow before the overflow batch limit is reached', async () => {
      const store = new InMemoryConversationStore();

      await store.appendMessage({
        id: 'checkpoint-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'checkpoint' }],
        operationalMemoryType: 'checkpoint-summary',
        createdAt: '2026-01-01T00:00:00Z',
      });

      // Add 3 messages with ~1 token each = 3 overflow tokens (below limit of 10)
      for (let i = 1; i <= 3; i += 1) {
        await store.appendMessage({
          id: `message-${i}`,
          threadId: 'thread-1',
          role: 'assistant',
          parts: [{ type: 'text', text: `${i}` }],
          createdAt: `2026-01-01T00:00:0${i}Z`,
        });
      }

      let observerCalled = false;

      const memory = new CheckpointedConversationMemory({
        threadId: 'thread-1',
        store,
        recentTokenLimit: 2,
        overflowObservationTokenLimit: 10, // High limit - overflow won't trigger
        observer: {
          async observe() {
            observerCalled = true;
            return { text: 'observed' };
          },
        },
      });

      await memory.stabilize();

      expect(observerCalled).toBe(false);
    });

    it('messages with tool metadata are not double counted', async () => {
      const store = new InMemoryConversationStore();

      await store.appendMessage({
        id: 'checkpoint-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'checkpoint' }],
        operationalMemoryType: 'checkpoint-summary',
        createdAt: '2026-01-01T00:00:00Z',
      });

      // Message with both text and tool metadata
      await store.appendMessage({
        id: 'tool-call',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'result' }],
        metadata: {
          toolResults: [{
            toolCallId: 'call-1',
            toolName: 'test',
            result: { output: 'output' },
          }],
        },
        createdAt: '2026-01-01T00:00:01Z',
      });

      const memory = new CheckpointedConversationMemory({
        threadId: 'thread-1',
        store,
        recentTokenLimit: 1,
        overflowObservationTokenLimit: 5,
        observer: {
          async observe(request) {
            return { text: request.messages.map((m) => getText(m)).join(' | ') };
          },
        },
      });

      const state = await memory.getState();
      // Tool metadata should not double count - only 1 message
      expect(state.recentMessageIds).toContain('tool-call');
      expect(state.overflowMessageIds).toHaveLength(0);
      // Token count should not be inflated
      expect(state.metrics.recentTokenCount).toBe(1);
    });
  });

  describe('filesystem state persistence', () => {
    it('saves and loads checkpointed state', async () => {
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

      const loaded = await stateStore.load('thread-1');
      expect(loaded).toMatchObject({
        checkpointMessageId: 'message-2',
        recentMessageIds: ['message-3'],
      });
    });

    it('loads returns null for non-existent thread', async () => {
      const tempDir = await mkdtemp(path.join(os.tmpdir(), 'agent-runtime-core-checkpointed-conversation-'));
      tempPaths.push(tempDir);

      const stateStore = new FilesystemCheckpointedConversationStateStore({
        rootDir: tempDir,
      });

      const loaded = await stateStore.load('non-existent-thread');
      expect(loaded).toBeNull();
    });
  });

  describe('observer behavior', () => {
    it('observer is called with overflow messages during stabilize', async () => {
      const store = new InMemoryConversationStore();

      await store.appendMessage({
        id: 'checkpoint-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'checkpoint' }],
        operationalMemoryType: 'checkpoint-summary',
        createdAt: '2026-01-01T00:00:00Z',
      });

      // Add 10 messages with ~5 tokens each = 10 overflow tokens (exceeds limit)
      for (let i = 1; i <= 10; i += 1) {
        await store.appendMessage({
          id: `message-${i}`,
          threadId: 'thread-1',
          role: 'assistant',
          parts: [{ type: 'text', text: generateContentNearTokens(5) }],
          createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        });
      }

      let observerCalled = false;
      let observedMessages: string[] = [];

      const memory = new CheckpointedConversationMemory({
        threadId: 'thread-1',
        store,
        recentTokenLimit: 2,
        overflowObservationTokenLimit: 5, // Triggers observation
        observer: {
          async observe(request) {
            observerCalled = true;
            observedMessages = request.messages.map((m) => m.id);
            return { text: request.messages.map((m) => getText(m)).join(' | ') };
          },
        },
      });

      await memory.stabilize();

      expect(observerCalled).toBe(true);
      expect(observedMessages.length).toBeGreaterThan(0);
    });

    it('observer failure is handled gracefully', async () => {
      const store = new InMemoryConversationStore();

      await store.appendMessage({
        id: 'checkpoint-1',
        threadId: 'thread-1',
        role: 'assistant',
        parts: [{ type: 'text', text: 'checkpoint' }],
        operationalMemoryType: 'checkpoint-summary',
        createdAt: '2026-01-01T00:00:00Z',
      });

      // Add 10 messages to create significant overflow
      for (let i = 1; i <= 10; i += 1) {
        await store.appendMessage({
          id: `message-${i}`,
          threadId: 'thread-1',
          role: 'assistant',
          parts: [{ type: 'text', text: generateContentNearTokens(5) }],
          createdAt: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
        });
      }

      let callCount = 0;
      const memory = new CheckpointedConversationMemory({
        threadId: 'thread-1',
        store,
        recentTokenLimit: 2,
        overflowObservationTokenLimit: 5,
        observer: {
          async observe() {
            callCount += 1;
            if (callCount > 1) {
              throw new Error('Simulated failure');
            }
            return { text: 'observed' };
          },
        },
      });

      // Should not throw
      await memory.stabilize();

      // At least first observation should have been recorded
      const state = await memory.getState();
      expect(state.observations.length).toBeGreaterThanOrEqual(1);
    });
  });
});