import type { Attachment } from './store';

export type CommunicationInboundMessage = {
  providerConversationKey: string;
  providerMessageId: string;
  conversationName?: string;
  authorExternalId?: string;
  authorDisplayName?: string;
  authorUsername?: string;
  content: string;
  attachments?: Attachment[];
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type CommunicationProvider = {
  id: string;
  getAccount(): Promise<{
    externalAccountId: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }>;
  start?(input: {
    onInbound(message: CommunicationInboundMessage): Promise<void>;
    upsertContact(input: {
      slug: string;
      displayName: string;
      provider: string;
      externalUserId?: string;
      username?: string;
    }): Promise<void>;
  }): Promise<void> | void;
  stop?(): Promise<void> | void;
  sendMessage(input: {
    providerConversationKey?: string;
    contactExternalId?: string;
    content: string;
    replyToProviderMessageId?: string;
  }): Promise<{
    providerConversationKey: string;
    providerMessageId?: string;
    conversationName?: string;
  }>;
};

export type CommunicationConversationView = {
  conversationId: string;
  provider: string;
  latestMessageAt: string;
  unreadCount: number;
  name?: string;
  contactSlug?: string;
  contactDisplayName?: string;
  messages: CommunicationMessageView[];
};

export type CommunicationMessageView = {
  messageId: string;
  conversationId: string;
  provider: string;
  direction: 'inbound' | 'outbound';
  content: string;
  attachments: Attachment[];
  unread: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
  authorExternalId?: string;
  authorDisplayName?: string;
  authorUsername?: string;
  contactSlug?: string;
  contactDisplayName?: string;
};
