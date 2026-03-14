import type { Attachment } from './communication-state';

export type ProviderMessageView = {
  messageId: string;
  direction: 'inbound' | 'outbound';
  provider: string;
  channelId?: string;
  channelName?: string;
  authorId?: string;
  authorName?: string;
  username?: string;
  content: string;
  attachments: Attachment[];
  unread: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
  contactSlug?: string;
  contactDisplayName?: string;
  conversationId: string;
};

export type ProviderConversationView = {
  conversationId: string;
  provider: string;
  channelId?: string;
  channelName?: string;
  contactSlug?: string;
  contactDisplayName?: string;
  latestMessageAt: string;
  unreadCount: number;
  messages: ProviderMessageView[];
};
