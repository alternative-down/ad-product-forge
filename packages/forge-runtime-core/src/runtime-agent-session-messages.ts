import { randomUUID } from 'node:crypto';

import type { ConversationMessage, ConversationStore, ConversationThread } from 'agent-runtime-core/integrations';

export type RuntimeSessionModelMessage =
  | {
      role: 'assistant' | 'system' | 'user';
      content: string | Array<
        | {
            type: 'text';
            text: string;
          }
        | {
            type: 'reasoning';
            text: string;
          }
        | {
            type: 'image';
            image: string;
          }
        | {
            type: 'tool-call';
            toolCallId: string;
            toolName: string;
            input: unknown;
          }
      >;
    }
  | {
      role: 'tool';
      content: Array<{
        type: 'tool-result';
        toolCallId: string;
        toolName: string;
        output: unknown;
      }>;
    };

export async function ensureRuntimeSessionThread(input: {
  store: ConversationStore;
  threadId: string;
  agentId: string;
}) {
  const existingThread = await input.store.getThread(input.threadId);
  const now = new Date().toISOString();

  if (existingThread) {
    await input.store.upsertThread({
      ...existingThread,
      participantIds: existingThread.participantIds?.length ? existingThread.participantIds : [input.agentId],
      updatedAt: now,
    });
    return;
  }

  await input.store.upsertThread({
    id: input.threadId,
    participantIds: [input.agentId],
    createdAt: now,
    updatedAt: now,
  });
}

export async function appendRuntimeSessionPromptMessages(input: {
  store: ConversationStore;
  threadId: string;
  agentId: string;
  messages: Array<{
    role: 'assistant' | 'user';
    content: string;
  }>;
}) {
  for (const message of input.messages) {
    await input.store.appendMessage({
      id: randomUUID(),
      threadId: input.threadId,
      role: message.role,
      authorId: message.role === 'assistant' ? input.agentId : undefined,
      parts: [{
        type: 'text',
        text: message.content,
      }],
      createdAt: new Date().toISOString(),
    });
  }
}

export async function appendRuntimeSessionModelMessages(input: {
  store: ConversationStore;
  threadId: string;
  assistantAuthorId?: string;
  messages: RuntimeSessionModelMessage[];
}) {
  for (const message of input.messages) {
    const persistedMessage = toConversationMessage({
      threadId: input.threadId,
      assistantAuthorId: input.assistantAuthorId,
      message,
    });

    if (!persistedMessage) {
      continue;
    }

    await input.store.appendMessage(persistedMessage);
  }
}

function toConversationMessage(input: {
  threadId: string;
  assistantAuthorId?: string;
  message: RuntimeSessionModelMessage;
}): ConversationMessage | null {
  const createdAt = new Date().toISOString();

  if (input.message.role === 'tool') {
    if (!Array.isArray(input.message.content) || input.message.content.length === 0) {
      return null;
    }

    return {
      id: randomUUID(),
      threadId: input.threadId,
      role: 'tool',
      parts: [],
      metadata: {
        toolResults: input.message.content
          .filter((part) => part.type === 'tool-result')
          .map((part) => ({
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: unwrapToolOutput(part.output),
          })),
      },
      createdAt,
    };
  }

  const parts = [];
  const toolInvocations = [];

  if (typeof input.message.content === 'string') {
    parts.push({
      type: 'text' as const,
      text: input.message.content,
    });
  } else {
    for (const part of input.message.content) {
      if (part.type === 'text') {
        parts.push({
          type: 'text' as const,
          text: part.text,
        });
        continue;
      }

      if (part.type === 'reasoning') {
        parts.push({
          type: 'reasoning' as const,
          text: part.text,
        });
        continue;
      }

      if (part.type === 'tool-call') {
        toolInvocations.push({
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          args: isRecord(part.input) ? part.input : {},
        });
      }
    }
  }

  if (parts.length === 0 && toolInvocations.length === 0) {
    return null;
  }

  return {
    id: randomUUID(),
    threadId: input.threadId,
    role: input.message.role,
    authorId: input.message.role === 'assistant' ? input.assistantAuthorId : undefined,
    parts,
    metadata: toolInvocations.length > 0
      ? {
          toolInvocations,
        }
      : undefined,
    createdAt,
  };
}

function unwrapToolOutput(output: unknown) {
  if (
    typeof output === 'object'
    && output !== null
    && 'type' in output
    && 'value' in output
    && output.type === 'json'
  ) {
    return (output as { value: unknown }).value;
  }

  return output;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
