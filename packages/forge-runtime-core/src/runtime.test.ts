import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  FakeStepModelAdapter,
  InMemoryCheckpointedConversationStateStore,
  InMemoryConversationStore,
} from 'agent-runtime-core/integrations';
import { z } from 'zod';

import { createForgeAgentRuntime } from './runtime.js';

describe('createForgeAgentRuntime', () => {
  it('persists conversation messages through the runtime bridge and observer flow', async () => {
    const conversationStore = new InMemoryConversationStore();
    const stateStore = new InMemoryCheckpointedConversationStateStore();
    const runtime = await createForgeAgentRuntime({
      config: {
        agentId: 'agent-1',
        threadId: 'thread-1',
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
        stateStore,
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

      const checkpointedState = await stateStore.load('thread-1');

      expect(checkpointedState?.recentMessageIds).toEqual([
        messages[0]?.id,
        messages[1]?.id,
      ]);
      expect(checkpointedState?.metrics.recentMessageCount).toBe(2);
    } finally {
      await runtime.dispose();
    }
  });

  it('persists tool-only assistant steps in the conversation log', async () => {
    const conversationStore = new InMemoryConversationStore();
    const stateStore = new InMemoryCheckpointedConversationStateStore();
    const runtime = await createForgeAgentRuntime({
      config: {
        agentId: 'agent-1',
        threadId: 'thread-1',
        consolidateConversationOverflow: true,
      },
      model: new FakeStepModelAdapter((request) => {
        if (request.stepNumber === 1) {
          return {
            segments: [],
            actionRequests: [{
              name: 'sum',
              input: {
                left: 2,
                right: 3,
              },
            }],
            continuation: 'continue',
          };
        }

        return {
          segments: [{
            kind: 'message',
            text: 'Done.',
          }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
      conversationStore,
      memory: {
        stateStore,
      },
      runtimeActions: [{
        name: 'sum',
        description: 'Add two integers',
        inputSchema: z.object({
          left: z.number(),
          right: z.number(),
        }),
        execute(input: { left: number; right: number }) {
          return input.left + input.right;
        },
      }],
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
          parts: [{ type: 'text', text: 'Calculate this.' }],
          createdAt: now,
        },
      });

      const firstStep = await runtime.host.runtime.step();
      const messages = await conversationStore.listMessages({
        threadId: 'thread-1',
      });

      expect(firstStep?.record.actionResults[0]?.output).toBe(5);
      expect(messages).toHaveLength(2);
      expect(messages[1]?.role).toBe('assistant');
      expect(messages[1]?.parts).toEqual([]);
      expect(messages[1]?.metadata).toMatchObject({
        toolInvocations: [{
          toolName: 'sum',
          args: {
            left: 2,
            right: 3,
          },
        }],
        toolResults: [{
          toolName: 'sum',
          result: 5,
        }],
      });
    } finally {
      await runtime.dispose();
    }
  });
});
