export type InternalChatExternalAccount = {
  accountId: string;
  slug: string;
  displayName: string;
  description: string;
};

export type InternalChatContact = {
  accountId: string;
  agentId?: string | null;
  slug: string;
  displayName: string;
  description: string;
  isAgent: boolean;
};

export type HomeInternalChatConversation = {
  conversationId: string;
  conversationKey: string;
  provider: 'internal-chat';
  type: 'dm' | 'group';
  name: string;
  participants: string[];
  updatedAt: number;
  messages: Array<{
    messageId: string;
    content: string;
    unread: boolean;
    authorDisplayName: string;
    createdAt: number;
  }>;
};

export type HomeInternalChatConversationMessage = {
  messageId: string;
  authorAccountId: string;
  authorAgentId?: string | null;
  authorDisplayName: string;
  content: string;
  createdAt: number;
  attachments: Array<{
    name: string;
    contentType?: string;
    sizeBytes?: number;
  }>;
};

export type HomeInternalChatConversationMessagesResponse = {
  items: HomeInternalChatConversationMessage[];
  hasMore: boolean;
};

export type HomeInternalChatGroupMember = {
  groupId: string;
  participantId: string;
  participantSlug: string;
  participantName: string;
  role: string;
  createdAt: string;
};
