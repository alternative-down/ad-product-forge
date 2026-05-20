export type AgentThreadMessage = {
  id: string;

  role: string;

  createdAt: number;

  threadId: string | null;

  resourceId: string | null;

  type: string | null;

  content: {
    content?: string;

    reasoning?: string;

    parts?: Array<Record<string, unknown>>;

    toolInvocations?: Array<Record<string, unknown>>;
  };
};

export type AgentThreadMessagesResponse = {
  items: AgentThreadMessage[];

  hasMore: boolean;
};

export type AgentConversationMessage = {
  messageId: string;

  provider: string;

  authorId: string;

  authorAgentId?: string | null;

  targetKey: string;

  content: string;

  attachments?: unknown[];

  unread: boolean;

  createdAt: string;

  authorDisplayName: string;
};

export type AgentConversationMessagesResponse = {
  items: AgentConversationMessage[];

  hasMore: boolean;
};
