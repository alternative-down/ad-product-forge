import { describe, expect, it } from 'vitest';
import { MockLanguageModelV3 } from 'ai/test';
import type { LanguageModelV3CallOptions } from '@ai-sdk/provider-v6';
import { z } from 'zod';

import {
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
  it('persists continued iteration feedback into the conversation thread before the next step', async () => {
    const conversationStore = new InMemoryConversationStore();
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
          expect(systemMessages).toEqual([
            {
              role: 'system',
              content: 'Base system.',
            },
            {
              role: 'system',
              content: 'Step system.',
            },
          ]);

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
    } finally {
      await session.dispose();
    }
  });

  it('adds the autonomous bootstrap user message before active raw messages', async () => {
    const conversationStore = new InMemoryConversationStore();
    const workingMemoryStore = createInMemoryWorkingMemoryStore();
    const assistantMessageId = 'assistant-tool-call';
    const toolMessageId = 'tool-result';
    const userMessageId = 'user-follow-up';
    const model = new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        expect(options.prompt).toEqual([
          {
            role: 'system',
            content: 'Base system.',
          },
          {
            role: 'user',
            content: [{
              type: 'text',
              text: 'You are an autonomous company agent. Think proactively, decide what to do next inside your role, and continue work without waiting for conversational prompting.',
              providerOptions: undefined,
            }],
            providerOptions: undefined,
          },
          {
            role: 'user',
            content: [{
              type: 'text',
              text: 'Continue.',
              providerOptions: undefined,
            }],
            providerOptions: undefined,
          },
        ]);

        return {
          content: [{ type: 'text', text: 'Done.' }],
          finishReason: { raw: 'stop', unified: 'stop' },
          usage: {
            inputTokens: {
              total: 18,
              noCache: 18,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 4,
              text: 4,
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
      workingMemoryStore,
    });

    await conversationStore.upsertThread({
      id: 'thread-1',
      participantIds: ['agent-1'],
      createdAt: '2026-04-22T20:00:00.000Z',
      updatedAt: '2026-04-22T20:00:03.000Z',
    });
    await conversationStore.appendMessage({
      id: assistantMessageId,
      threadId: 'thread-1',
      role: 'assistant',
      authorId: 'agent-1',
      parts: [],
      metadata: {
        toolInvocations: [{
          toolName: 'search_workspace',
          args: {
            query: 'design tokens',
          },
        }],
      },
      createdAt: '2026-04-22T20:00:01.000Z',
    });
    await conversationStore.appendMessage({
      id: toolMessageId,
      threadId: 'thread-1',
      role: 'tool',
      parts: [],
      metadata: {
        toolResults: [{
          toolCallId: 'call_function_vhsx8981e6sk_1',
          toolName: 'search_workspace',
          result: {
            hits: ['tokens.md'],
          },
        }],
      },
      createdAt: '2026-04-22T20:00:02.000Z',
    });
    await conversationStore.appendMessage({
      id: userMessageId,
      threadId: 'thread-1',
      role: 'user',
      parts: [{
        type: 'text',
        text: 'Continue.',
      }],
      createdAt: '2026-04-22T20:00:03.000Z',
    });
    try {
      const result = await session.generate([]);

      expect(result.text).toBe('Done.');
    } finally {
      await session.dispose();
    }
  });

  it('keeps the autonomous bootstrap user message ahead of regular user raw messages', async () => {
    const conversationStore = new InMemoryConversationStore();
    const workingMemoryStore = createInMemoryWorkingMemoryStore();
    const toolCallId = 'call_function_orphan_1';
    const model = new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        expect(options.prompt).toEqual([
          {
            role: 'system',
            content: 'Base system.',
          },
          {
            role: 'user',
            content: [{
              type: 'text',
              text: 'You are an autonomous company agent. Think proactively, decide what to do next inside your role, and continue work without waiting for conversational prompting.',
              providerOptions: undefined,
            }],
            providerOptions: undefined,
          },
          {
            role: 'user',
            content: [{
              type: 'text',
              text: 'Continue.',
            }],
          },
        ]);

        return {
          content: [{ type: 'text', text: 'Done.' }],
          finishReason: { raw: 'stop', unified: 'stop' },
          usage: {
            inputTokens: {
              total: 8,
              noCache: 8,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 4,
              text: 4,
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
      workingMemoryStore,
    });

    await conversationStore.upsertThread({
      id: 'thread-1',
      participantIds: ['agent-1'],
      createdAt: '2026-04-23T00:00:00.000Z',
      updatedAt: '2026-04-23T00:00:02.000Z',
    });
    await conversationStore.appendMessage({
      id: 'orphan-tool-result',
      threadId: 'thread-1',
      role: 'tool',
      parts: [],
      metadata: {
        toolResults: [{
          toolCallId,
          toolName: 'workspace_execute_command',
          result: {
            exitCode: 0,
          },
        }],
      },
      createdAt: '2026-04-23T00:00:01.000Z',
    });
    await conversationStore.appendMessage({
      id: 'user-follow-up',
      threadId: 'thread-1',
      role: 'user',
      parts: [{
        type: 'text',
        text: 'Continue.',
      }],
      createdAt: '2026-04-23T00:00:02.000Z',
    });
    try {
      const result = await session.generate([]);

      expect(result.text).toBe('Done.');
    } finally {
      await session.dispose();
    }
  });

  it('renders checkpoint summary, reflections, and observations as individual model messages', async () => {
    const conversationStore = new InMemoryConversationStore();
    const workingMemoryStore = createInMemoryWorkingMemoryStore();
    await conversationStore.appendMessage({
      id: 'checkpoint-summary-1',
      threadId: 'thread-1',
      role: 'system',
      parts: [{ type: 'text', text: 'Checkpoint summary:\ncheckpoint text' }],
      operationalMemoryType: 'checkpoint-summary',
      operationalMemoryGeneration: 2,
      createdAt: '2026-04-24T00:00:00.000Z',
    });
    await conversationStore.appendMessage({
      id: 'reflection-1',
      threadId: 'thread-1',
      role: 'system',
      parts: [{ type: 'text', text: 'Active reflection:\nreflection one' }],
      operationalMemoryType: 'reflection',
      operationalMemoryGeneration: 3,
      createdAt: '2026-04-24T00:00:01.000Z',
    });
    await conversationStore.appendMessage({
      id: 'reflection-2',
      threadId: 'thread-1',
      role: 'system',
      parts: [{ type: 'text', text: 'Active reflection:\nreflection two' }],
      operationalMemoryType: 'reflection',
      operationalMemoryGeneration: 4,
      createdAt: '2026-04-24T00:00:02.000Z',
    });
    await conversationStore.appendMessage({
      id: 'observation-1',
      threadId: 'thread-1',
      role: 'system',
      parts: [{ type: 'text', text: 'Active observation:\nobservation one' }],
      operationalMemoryType: 'observation',
      createdAt: '2026-04-24T00:00:03.000Z',
    });
    const model = new MockLanguageModelV3({
      doGenerate: async (options: LanguageModelV3CallOptions) => {
        expect(options.prompt).toEqual([
          {
            role: 'system',
            content: 'Base system.',
          },
          {
            role: 'system',
            content: 'Step system.',
            providerOptions: undefined,
          },
          {
            role: 'user',
            content: [{
              type: 'text',
              text: 'You are an autonomous company agent. Think proactively, decide what to do next inside your role, and continue work without waiting for conversational prompting.',
              providerOptions: undefined,
            }],
            providerOptions: undefined,
          },
          {
            role: 'system',
            content: 'Checkpoint summary:\ncheckpoint text',
            providerOptions: undefined,
          },
          {
            role: 'system',
            content: 'Active reflection:\nreflection one',
            providerOptions: undefined,
          },
          {
            role: 'system',
            content: 'Active reflection:\nreflection two',
            providerOptions: undefined,
          },
          {
            role: 'system',
            content: 'Active observation:\nobservation one',
            providerOptions: undefined,
          },
          {
            role: 'user',
            content: [{
              type: 'text',
              text: 'Continue.',
              providerOptions: undefined,
            }],
            providerOptions: undefined,
          },
        ]);

        return {
          content: [{ type: 'text', text: 'Done.' }],
          finishReason: { raw: 'stop', unified: 'stop' },
          usage: {
            inputTokens: {
              total: 18,
              noCache: 18,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 4,
              text: 4,
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
      workingMemoryStore,
    });

    await conversationStore.upsertThread({
      id: 'thread-1',
      participantIds: ['agent-1'],
      createdAt: '2026-04-24T00:00:00.000Z',
      updatedAt: '2026-04-24T00:00:01.000Z',
    });
    await conversationStore.appendMessage({
      id: 'user-follow-up',
      threadId: 'thread-1',
      role: 'user',
      parts: [{
        type: 'text',
        text: 'Continue.',
      }],
      createdAt: '2026-04-24T00:00:01.000Z',
    });

    try {
      const result = await session.generate([], {
        system: 'Step system.',
      });

      expect(result.text).toBe('Done.');
    } finally {
      await session.dispose();
    }
  });

  it('loads dynamic runtime actions on each iteration without rebuilding the session', async () => {
    const conversationStore = new InMemoryConversationStore();
    const workingMemoryStore = createInMemoryWorkingMemoryStore();
    const loadedActionNames: string[][] = [];
    let loadCount = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        loadCount += 1;

        return {
          content: [{
            type: 'text',
            text: loadCount === 1 ? 'First step response.' : 'Second step response.',
          }],
          finishReason: { raw: 'stop', unified: 'stop' },
          usage: {
            inputTokens: {
              total: 12,
              noCache: 12,
              cacheRead: 0,
              cacheWrite: 0,
            },
            outputTokens: {
              total: 6,
              text: 6,
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
      workingMemoryStore,
      loadRuntimeActions: async () => {
        const actions = loadCount === 0
          ? []
          : [{
            name: `mcp_tool_${loadCount}`,
            description: 'MCP tool.',
            inputSchema: z.object({}).passthrough(),
            async execute() {
              return { ok: true };
            },
          }];

        loadedActionNames.push(actions.map((action) => action.name));
        return actions;
      },
    });

    try {
      const result = await session.generate('Initial prompt.', {
        onIterationComplete(iteration) {
          if (iteration.iteration === 1) {
            return {
              continue: true,
              feedback: 'Continue.',
            };
          }

          return {
            continue: false,
          };
        },
      });

      expect(result.text).toBe('Second step response.');
      expect(loadedActionNames).toEqual([
        [],
        ['mcp_tool_1'],
      ]);
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
