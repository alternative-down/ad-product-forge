import type {
  ConversationMessage,
  ConversationMessagePart,
  ConversationThread,
} from 'agent-runtime-core/integrations';

export function createForgeConversationThread(input: {
  threadId: string;
  title?: string;
  participantIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}): ConversationThread {
  const now = input.updatedAt ?? input.createdAt ?? new Date().toISOString();

  return {
    id: input.threadId,
    title: input.title,
    participantIds: input.participantIds,
    metadata: input.metadata,
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

export function createForgeConversationMessage(input: {
  messageId: string;
  threadId: string;
  role: ConversationMessage['role'];
  authorId?: string;
  parts: ConversationMessagePart[];
  metadata?: Record<string, unknown>;
  createdAt?: string;
}): ConversationMessage {
  return {
    id: input.messageId,
    threadId: input.threadId,
    role: input.role,
    authorId: input.authorId,
    parts: input.parts,
    metadata: input.metadata,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}
