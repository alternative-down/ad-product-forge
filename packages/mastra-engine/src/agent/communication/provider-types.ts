import type { Attachment } from './store';

export type CommunicationInboundMessage = {
  targetKey: string;
  messageId: string;
  conversationName?: string;
  authorId?: string;
  authorDisplayName?: string;
  authorUsername?: string;
  content: string;
  attachments?: Attachment[];
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type CommunicationProvider = {
  id: string;
  onMessage?(callback: (message: CommunicationInboundMessage) => Promise<void>): Promise<void> | void;
  listConversations?(input: {
    limit: number;
    unread?: boolean;
  }): Promise<CommunicationConversationView[]>;
  getMessages?(input: {
    targetKey: string;
    limit: number;
  }): Promise<CommunicationMessageView[]>;
  sendMessage(input: {
    targetKey: string;
    content: string;
  }): Promise<{
    targetKey: string;
    messageId?: string;
    conversationName?: string;
  }>;
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
  attachments: Attachment[];
  unread: boolean;
  createdAt: string;
  authorDisplayName?: string;
};
