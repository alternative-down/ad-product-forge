import { describe, expect, it } from 'vitest';

import {
  InMemoryCheckpointedConversationStateStore,
  InMemoryConversationStore,
  FakeStepModelAdapter,
} from 'agent-runtime-core/integrations';

import { createForgeConversationMessage, createForgeConversationThread } from './conversation.js';
import { createForgeMcpToolsetFromStore } from './mcp-store.js';
import { createForgeAgentRuntime } from './runtime.js';
import { InMemoryForgeUsageSink } from './usage.js';

describe('forge runtime core conversation helpers', () => {
  it('creates thread and message records', () => {
    const thread = createForgeConversationThread({
      threadId: 'thread-1',
      title: 'General',
    });
    const message = createForgeConversationMessage({
      messageId: 'message-1',
      threadId: 'thread-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    });

    expect(thread.id).toBe('thread-1');
    expect(message.threadId).toBe('thread-1');
  });
});

describe('createForgeAgentRuntime', () => {
  it('creates a runtime with conversation memory and bridge', async () => {
    const conversationStore = new InMemoryConversationStore();
    const usageSink = new InMemoryForgeUsageSink();
    const runtime = await createForgeAgentRuntime({
      config: {
        agentId: 'agent-1',
        threadId: 'thread-1',
        maxConversationMessages: 20,
        consolidateConversationOverflow: true,
      },
      model: new FakeStepModelAdapter(async () => ({
        segments: [{
          kind: 'message',
          text: 'Hello back',
        }],
        actionRequests: [],
        continuation: 'stop',
      })),
      conversationStore,
      memory: {
        stateStore: new InMemoryCheckpointedConversationStateStore(),
      },
      usageSink,
    });

    await runtime.bridge.dispatchMessage({
      thread: createForgeConversationThread({
        threadId: 'thread-1',
      }),
      message: createForgeConversationMessage({
        messageId: 'message-1',
        threadId: 'thread-1',
        role: 'user',
        parts: [{ type: 'text', text: 'Hello' }],
      }),
    });

    const result = await runtime.host.runtime.step();
    const messages = await conversationStore.listMessages({
      threadId: 'thread-1',
    });

    expect(result?.record.modelResponse.segments[0]?.text).toBe('Hello back');
    expect(messages).toHaveLength(2);
    expect(usageSink.list()).toHaveLength(1);
    await runtime.dispose();
  });

  it('returns no mcp toolset when the store has no servers', async () => {
    const toolset = await createForgeMcpToolsetFromStore({
      agentId: 'agent-1',
      store: {
        async listServersForAgent() {
          return [];
        },
      },
    });

    expect(toolset).toBeNull();
  });
});
