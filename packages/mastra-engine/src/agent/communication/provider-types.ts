export type CommunicationFile = {
  name: string;
  data: Uint8Array;
  contentType?: string;
  sizeBytes?: number;
};

export type CommunicationAttachmentView = {
  path: string;
  name: string;
  contentType?: string;
  sizeBytes?: number;
};

export type CommunicationInboundMessage = {
  targetKey: string;
  messageId: string;
  conversationName?: string;
  authorId?: string;
  authorDisplayName?: string;
  authorUsername?: string;
  content: string;
  attachments?: CommunicationFile[];
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type CommunicationProviderMessage = {
  messageId: string;
  provider: string;
  authorId?: string;
  targetKey?: string;
  content: string;
  attachments: CommunicationFile[];
  unread: boolean;
  createdAt: string;
  authorDisplayName?: string;
};

export type CommunicationProviderContact = {
  slug: string;
  displayName: string;
  description?: string;
  agentId?: string;
};

export type CommunicationProviderConversation = {
  targetKey: string;
  provider: string;
  latestMessageAt: string;
  unreadCount: number;
  name?: string;
  participants?: string[];
  messages: CommunicationProviderMessage[];
};

export type CommunicationConversationView = {
  targetKey: string;
  provider: string;
  latestMessageAt: string;
  unreadCount: number;
  name?: string;
  participants?: string[];
  messages: CommunicationMessageView[];
};

export type CommunicationMessageView = {
  messageId: string;
  provider: string;
  authorId?: string;
  targetKey?: string;
  content: string;
  attachments: CommunicationAttachmentView[];
  unread: boolean;
  createdAt: string;
  authorDisplayName?: string;
};

export type CommunicationProvider = {
  id: string;
  onMessage?(callback: (message: CommunicationInboundMessage) => Promise<void>): Promise<void> | void;
  listContacts?(): Promise<CommunicationProviderContact[]>;
  listConversations?(input: {
    limit: number;
    unread?: boolean;
  }): Promise<CommunicationProviderConversation[]>;
  getMessages?(input: {
    targetKey: string;
    limit: number;
    offset: number;
  }): Promise<CommunicationProviderMessage[]>;
  sendMessage(input: {
    targetKey: string;
    content: string;
    attachments: CommunicationFile[];
  }): Promise<{
    targetKey: string;
    messageId?: string;
    conversationName?: string;
  }>;
};
