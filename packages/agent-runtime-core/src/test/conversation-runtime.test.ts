import { describe, expect, it } from 'vitest';

import { AgentRuntime } from '../core/runtime.js';
import { InMemoryConversationStore } from '../integrations/conversations/in-memory-conversation-store.js';
import { createConversationHistoryPlugin } from '../integrations/conversations/history-plugin.js';
import { ConversationRuntimeBridge } from '../integrations/conversations/runtime-bridge.js';
import { createConversationRuntimeObserver } from '../integrations/conversations/runtime-observer.js';
import { FakeStepModelAdapter } from '../integrations/testing/fake-model.js';

describe('conversation runtime integrations', () => {
  it('loads prior thread messages into step context and appends assistant output back to the store', async () => {
    const store = new InMemoryConversationStore();
    const seenContext: string[] = [];
    const runtime = new AgentRuntime({
      runtimeId: 'runtime-1',
      model: new FakeStepModelAdapter((request) => {
        seenContext.push(...request.context.map((entry) => entry.title));

        return {
          segments: [{
            kind: 'message',
            text: 'Hi back',
          }],
          actionRequests: [],
          continuation: 'stop',
        };
      }),
    });
    const bridge = new ConversationRuntimeBridge({
      runtime,
      store,
    });

    runtime.use(createConversationHistoryPlugin({ store }));
    runtime.observe(createConversationRuntimeObserver({
      store,
      authorId: 'agent-1',
    }));

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
      authorId: 'user-1',
      parts: [{
        type: 'text',
        text: 'First message',
      }],
      createdAt: '2026-01-01T00:00:01.000Z',
    });

    await bridge.dispatchMessage({
      thread: {
        id: 'thread-1',
        title: 'General',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:02.000Z',
      },
      message: {
        id: 'message-2',
        threadId: 'thread-1',
        role: 'user',
        authorId: 'user-1',
        parts: [{
          type: 'text',
          text: 'Second message',
        }],
        createdAt: '2026-01-01T00:00:02.000Z',
      },
    });

    await runtime.step();

    expect(seenContext).toContain('user message from user-1');

    const messages = await store.listMessages({ threadId: 'thread-1' });

    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      authorId: 'agent-1',
    });
    expect(messages.at(-1)?.parts[0]).toEqual({
      type: 'text',
      text: 'Hi back',
    });
  });
});
