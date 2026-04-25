export type ConversationMessagePart =
  | {
    type: 'text';
    text: string;
  }
  | {
    type: 'reasoning';
    text: string;
    providerMetadata?: {
      anthropic?: {
        signature?: string;
        redactedData?: string;
      };
    };
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

export type ConversationOperationalMemoryType =
  | 'observation'
  | 'reflection'
  | 'checkpoint-summary';

export type ConversationMessage = {
  id: string;
  threadId: string;
  role: 'user' | 'assistant' | 'system' | 'tool' | 'external';
  authorId?: string;
  parts: ConversationMessagePart[];
  metadata?: Record<string, unknown>;
  replacedByMessageId?: string | null;
  operationalMemoryType?: ConversationOperationalMemoryType;
  operationalMemoryGeneration?: number | null;
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
  updateMessage(input: {
    threadId: string;
    messageId: string;
    role?: ConversationMessage['role'];
    parts?: ConversationMessagePart[];
    metadata?: Record<string, unknown> | undefined;
    operationalMemoryType?: ConversationOperationalMemoryType | undefined;
    operationalMemoryGeneration?: number | null | undefined;
  }): Promise<void>;
  updateMessageMetadata(input: {
    threadId: string;
    messageId: string;
    metadata: Record<string, unknown> | undefined;
  }): Promise<void>;
  updateMessageReplacement(input: {
    threadId: string;
    messageId: string;
    replacedByMessageId: string | null;
  }): Promise<void>;
  listMessages(query: ConversationMessageListQuery): Promise<ConversationMessage[]>;
  listOperationalMemoryMessages(input: {
    threadId: string;
  }): Promise<ConversationMessage[]>;
}
