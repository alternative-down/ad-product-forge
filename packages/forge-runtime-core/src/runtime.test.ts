import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  FakeStepModelAdapter,
  InMemoryCheckpointedConversationStateStore,
  InMemoryConversationStore,
} from 'agent-runtime-core/integrations';

import { createForgeAgentRuntime } from './runtime.js';

describe('createForgeAgentRuntime', () => {
  it('persists conversation messages through the runtime bridge and observer flow', async () => {
    const conversationStore = new InMemoryConversationStore();
    const runtime = await createForgeAgentRuntime({
      config: {
        agentId: 'agent-1',
        threadId: 'thread-1',
        maxConversationMessages: 20,
        consolidateConversationOverflow: true,
      },
      model: new FakeStepModelAdapter(() => ({
        segments: [
          {
            kind: 'message',
            text: 'Reply from runtime.',
          },
        ],
        actionRequests: [],
        continuation: 'stop',
      })),
      conversationStore,
      memory: {
        stateStore: new InMemoryCheckpointedConversationStateStore(),
      },
    });

    try {
      const now = new Date().toISOString();

      await runtime.bridge.dispatchMessage({
        thread: {
          id: 'thread-1',
          participantIds: ['agent-1'],
          createdAt: now,
          updatedAt: now,
        },
        message: {
          id: randomUUID(),
          threadId: 'thread-1',
          role: 'user',
          parts: [{ type: 'text', text: 'Hello runtime.' }],
          createdAt: now,
        },
      });

      const result = await runtime.host.runtime.step();
      const messages = await conversationStore.listMessages({
        threadId: 'thread-1',
      });

      expect(result?.record.modelResponse.segments).toEqual([
        {
          kind: 'message',
          text: 'Reply from runtime.',
        },
      ]);
      expect(messages).toHaveLength(2);
      expect(messages[0]?.role).toBe('user');
      expect(messages[1]?.role).toBe('assistant');
      expect(messages[1]?.parts).toEqual([
        {
          type: 'text',
          text: 'Reply from runtime.',
        },
      ]);
    } finally {
      await runtime.dispose();
    }
  });
});
