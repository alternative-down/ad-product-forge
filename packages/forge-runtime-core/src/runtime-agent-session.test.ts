import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3CallOptions } from '@ai-sdk/provider-v6';

import {
  InMemoryCheckpointedConversationStateStore,
  InMemoryConversationStore,
} from 'agent-runtime-core/integrations';

import {
  createRuntimeAgentSession,
  type RuntimeAgentSessionIteration,
} from './runtime-agent-session.js';
import type {
  RuntimeWorkingMemoryStore,
  WorkingMemoryRecord,
} from './runtime-working-memory.js';

describe('createRuntimeAgentSession', () => {
  it('persists continued iterations and feedback in one runtime session', async () => {
    const conversationStore = new InMemoryConversationStore();
    const checkpointedStateStore = new InMemoryCheckpointedConversationStateStore();
    const workingMemoryStore = createInMemoryWorkingMemoryStore();
    const model = new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        expect(options.providerOptions).toEqual({
          anthropic: {
            cacheControl: {
              type: 'ephemeral',
            },
          },
        });

        const systemMessages = options.prompt.filter((message) => message.role === 'system');
        const assistantMessages = options.prompt.filter((message) => message.role === 'assistant');

        if (assistantMessages.length === 0) {
          expect(systemMessages).toEqual([{
            role: 'system',
            content: 'Base system.\n\nStep system.',
          }]);

          return {
            content: [{ type: 'text', text: 'First step response.' }],
            finishReason: { raw: 'stop', unified: 'stop' },
            usage: {
              inputTokens: {
                total: 20,
                noCache: 20,
                cacheRead: 0,
                cacheWrite: 0,
              },
              outputTokens: {
                total: 8,
                text: 8,
                reasoning: 0,
              },
            },
            warnings: [],
          };
        }

        expect(systemMessages).toEqual([{
          role: 'system',
          content: 'Base system.',
        }]);
        expect(options.prompt.at(-1)).toEqual({
          role: 'user',
          content: [{
            type: 'text',
            text: 'Continue from the previous step.',
          }],
        });

        return {
          content: [{ type: 'text', text: 'Second step response.' }],
          finishReason: { raw: 'stop', unified: 'stop' },
          usage: {
            inputTokens: {
              total: 22,
              noCache: 22,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 9,
              text: 9,
              reasoning: 0,
            },
          },
          warnings: [],
        };
      },
    });
    const session = await createRuntimeAgentSession({
      agentId: 'agent-1',
      agentName: 'Forge Agent',
      threadId: 'thread-1',
      resourceId: 'resource-1',
      assistantAuthorId: 'agent-1',
      model,
      system: 'Base system.',
      conversationStore,
      checkpointedStateStore,
      workingMemoryStore,
    });
    const iterations: RuntimeAgentSessionIteration[] = [];

    try {
      const result = await session.generate('Initial prompt.', {
        system: 'Step system.',
        providerOptions: {
          anthropic: {
            cacheControl: {
              type: 'ephemeral',
            },
          },
        },
        onIterationComplete(iteration) {
          iterations.push(iteration);

          if (iteration.iteration === 1) {
            return {
              continue: true,
              feedback: 'Continue from the previous step.',
            };
          }

          return {
            continue: false,
          };
        },
      });

      const messages = await conversationStore.listMessages({
        threadId: 'thread-1',
      });
      const checkpointedState = await checkpointedStateStore.load('thread-1');

      expect(result.text).toBe('Second step response.');
      expect(iterations).toHaveLength(2);
      expect(messages.map((message) => ({
        role: message.role,
        text: message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text)
          .join('\n'),
      }))).toEqual([
        {
          role: 'user',
          text: 'Initial prompt.',
        },
        {
          role: 'assistant',
          text: 'First step response.',
        },
        {
          role: 'user',
          text: 'Continue from the previous step.',
        },
        {
          role: 'assistant',
          text: 'Second step response.',
        },
      ]);
      expect(checkpointedState?.metrics.recentMessageCount).toBe(4);
      expect(checkpointedState?.recentMessageIds).toEqual(messages.map((message) => message.id));
    } finally {
      await session.dispose();
    }
  });
});

function createInMemoryWorkingMemoryStore(): RuntimeWorkingMemoryStore {
  const records = new Map<string, WorkingMemoryRecord>();

  return {
    async read(input) {
      return records.get(`${input.threadId}:${input.resourceId}`) ?? null;
    },
    async write(input) {
      records.set(`${input.threadId}:${input.resourceId}`, {
        threadId: input.threadId,
        resourceId: input.resourceId,
        workingMemory: input.workingMemory,
        updatedAt: input.updatedAt ?? new Date().toISOString(),
      });
    },
  };
}
