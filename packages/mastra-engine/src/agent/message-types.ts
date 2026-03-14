import { z } from 'zod';

import { attachmentSchema } from './message-state';

export type SenderInput = {
  target: string;
  contactSlug?: string;
  content: string;
  replyToMessageId?: string;
};

export type SenderResult = {
  messageId?: string;
  channelId?: string;
};

export type MessageView = {
  messageId: string;
  accountId: string;
  direction: 'inbound' | 'outbound';
  provider: string;
  channelId?: string;
  channelName?: string;
  authorId?: string;
  authorName?: string;
  username?: string;
  content: string;
  attachments: z.infer<typeof attachmentSchema>[];
  unread: boolean;
  createdAt: string;
  metadata?: Record<string, unknown>;
  contactSlug?: string;
  contactDisplayName?: string;
  conversationId: string;
};

export type ConversationView = {
  conversationId: string;
  provider: string;
  channelId?: string;
  channelName?: string;
  contactSlug?: string;
  contactDisplayName?: string;
  latestMessageAt: string;
  unreadCount: number;
  messages: MessageView[];
};
