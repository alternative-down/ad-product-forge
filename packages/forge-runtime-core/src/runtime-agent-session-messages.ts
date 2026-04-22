import { randomUUID } from 'node:crypto';

import type { ConversationRuntimeBridge } from 'agent-runtime-core/integrations';

export async function dispatchRuntimeSessionMessages(input: {
  bridge: ConversationRuntimeBridge;
  threadId: string;
  agentId: string;
  messages: Array<{
    role: 'assistant' | 'user';
    content: string;
  }>;
}) {
  for (const message of input.messages) {
    await input.bridge.dispatchMessage({
      thread: {
        id: input.threadId,
        participantIds: [input.agentId],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      message: {
        id: randomUUID(),
        threadId: input.threadId,
        role: message.role,
        authorId: message.role === 'assistant' ? input.agentId : undefined,
        parts: [{
          type: 'text',
          text: message.content,
        }],
        createdAt: new Date().toISOString(),
      },
    });
  }
}

export async function dispatchRuntimeSessionFeedback(input: {
  bridge: ConversationRuntimeBridge;
  threadId: string;
  agentId: string;
  text: string;
}) {
  await input.bridge.dispatchMessage({
    thread: {
      id: input.threadId,
      participantIds: [input.agentId],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    message: {
      id: randomUUID(),
      threadId: input.threadId,
      role: 'user',
      parts: [{
        type: 'text',
        text: input.text,
      }],
      createdAt: new Date().toISOString(),
    },
  });
}
