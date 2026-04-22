export type ConversationMessagePart =
  | {
    type: 'text';
    text: string;
  }
  | {
    type: 'image';
    mimeType: string;
    bytes: Uint8Array;
  }
  | {
    type: 'file';
    mimeType: string;
    name: string;
    bytes: Uint8Array;
  };

export type ConversationThread = {
  id: string;
  title?: string;
  participantIds?: string[];
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ConversationMessage = {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'external';
  authorId?: string;
  parts: ConversationMessagePart[];
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type ConversationMessageListQuery = {
  threadId: string;
  limit?: number;
  beforeMessageId?: string;
  afterMessageId?: string;
  order?: 'asc' | 'desc';
};

export interface ConversationStore {
  upsertThread(thread: ConversationThread): Promise<void>;
  getThread(threadId: string): Promise<ConversationThread | null>;
  listThreads(): Promise<ConversationThread[]>;
  appendMessage(message: ConversationMessage): Promise<void>;
  listMessages(query: ConversationMessageListQuery): Promise<ConversationMessage[]>;
}
