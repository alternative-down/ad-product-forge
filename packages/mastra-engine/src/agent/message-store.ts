import { z } from 'zod';

import { agentContacts } from './agent-contacts';
import { communicationState, type Attachment, type StoredMessage } from './communication-state';

const inboundMessageSchema = z.object({
  agentId: z.string(),
  accountId: z.string(),
  messageId: z.string(),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  username: z.string().optional(),
  content: z.string(),
  attachments: z
    .array(
      z.object({
        id: z.string().optional(),
        name: z.string().optional(),
        url: z.string(),
        contentType: z.string().optional(),
        sizeBytes: z.number().optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const outboundMessageSchema = z.object({
  accountId: z.string(),
  provider: z.string(),
  messageId: z.string(),
  channelId: z.string().optional(),
  content: z.string(),
  contactSlug: z.string().optional(),
  replyToMessageId: z.string().optional(),
});

const listConversationsSchema = z.object({
  agentId: z.string(),
  provider: z.string().optional(),
  contactSlug: z.string().optional(),
  unread: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

const getMessagesSchema = z.object({
  agentId: z.string(),
  conversationId: z.string(),
  limit: z.number().int().positive().max(200).default(100),
});

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
  attachments: Attachment[];
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

export function createMessageStore() {
  async function saveInboundMessage(rawInput: unknown) {
    const input = inboundMessageSchema.parse(rawInput);
    const state = await communicationState.read();
    const alreadyExists = state.messages.some(
      (message) => message.accountId === input.accountId && message.messageId === input.messageId,
    );

    if (alreadyExists) {
      return;
    }

    state.messages.push({
      messageId: input.messageId,
      accountId: input.accountId,
      direction: 'inbound',
      channelId: input.channelId,
      channelName: input.channelName,
      authorId: input.authorId,
      authorName: input.authorName,
      username: input.username,
      content: input.content,
      attachments: input.attachments,
      unread: true,
      createdAt: input.createdAt,
      metadata: input.metadata,
    });

    await communicationState.save();
  }

  async function saveOutboundMessage(rawInput: unknown) {
    const input = outboundMessageSchema.parse(rawInput);
    const state = await communicationState.read();

    state.messages.push({
      messageId: input.messageId,
      accountId: input.accountId,
      direction: 'outbound',
      channelId: input.channelId,
      content: input.content,
      attachments: [],
      unread: false,
      createdAt: new Date().toISOString(),
      metadata: {
        provider: input.provider,
        contactSlug: input.contactSlug,
        replyToMessageId: input.replyToMessageId,
      },
    });

    await communicationState.save();
  }

  async function findMessage(accountId: string, messageId: string) {
    const state = await communicationState.read();
    return state.messages.find((message) => message.accountId === accountId && message.messageId === messageId) ?? null;
  }

  async function toMessageView(agentId: string, message: StoredMessage) {
    const state = await communicationState.read();
    const account = state.accounts.find((current) => current.accountId === message.accountId);

    if (!account) {
      throw new Error(`Account not found for message: ${message.accountId}`);
    }

    const contact = await agentContacts.findContactByIdentity(
      agentId,
      account.provider,
      message.authorId,
      message.username,
    );
    const conversationId = `${account.provider}:${message.channelId || contact?.slug || message.authorId || message.messageId}`;

    return {
      messageId: message.messageId,
      accountId: message.accountId,
      direction: message.direction,
      provider: account.provider,
      channelId: message.channelId,
      channelName: message.channelName,
      authorId: message.authorId,
      authorName: message.authorName,
      username: message.username,
      content: message.content,
      attachments: message.attachments,
      unread: message.unread,
      createdAt: message.createdAt,
      metadata: message.metadata,
      contactSlug: contact?.slug,
      contactDisplayName: contact?.displayName,
      conversationId,
    } satisfies MessageView;
  }

  async function listMessageConversations(rawInput: unknown) {
    const input = listConversationsSchema.parse(rawInput);
    const state = await communicationState.read();
    const accountIds = new Set(
      state.accounts
        .filter((account) => account.agentId === input.agentId)
        .filter((account) => !input.provider || account.provider === input.provider)
        .map((account) => account.accountId),
    );
    const conversations = new Map<string, ConversationView>();

    for (const message of state.messages) {
      if (!accountIds.has(message.accountId)) {
        continue;
      }

      if (input.unread !== undefined && message.unread !== input.unread) {
        continue;
      }

      const view = await toMessageView(input.agentId, message);
      if (input.contactSlug && view.contactSlug !== input.contactSlug) {
        continue;
      }

      let conversation = conversations.get(view.conversationId);

      if (!conversation) {
        conversation = {
          conversationId: view.conversationId,
          provider: view.provider,
          channelId: view.channelId,
          channelName: view.channelName,
          contactSlug: view.contactSlug,
          contactDisplayName: view.contactDisplayName,
          latestMessageAt: view.createdAt,
          unreadCount: 0,
          messages: [],
        };
        conversations.set(view.conversationId, conversation);
      }

      conversation.messages.push(view);
      conversation.latestMessageAt = view.createdAt;
      if (view.unread) {
        conversation.unreadCount += 1;
      }
    }

    const result = Array.from(conversations.values())
      .sort((left, right) => new Date(right.latestMessageAt).getTime() - new Date(left.latestMessageAt).getTime())
      .slice(0, input.limit)
      .map((conversation) => ({
        ...conversation,
        messages: conversation.messages
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
          .slice(-5),
      }));
    const unreadKeys = new Set(
      result
        .flatMap((conversation) => conversation.messages)
        .filter((message) => message.unread)
        .map((message) => `${message.accountId}:${message.messageId}`),
    );

    if (unreadKeys.size > 0) {
      for (const message of state.messages) {
        if (!accountIds.has(message.accountId)) {
          continue;
        }

        if (!unreadKeys.has(`${message.accountId}:${message.messageId}`)) {
          continue;
        }

        if (!message.unread) {
          continue;
        }

        message.unread = false;
      }

      await communicationState.save();
    }

    return result;
  }

  async function getMessages(rawInput: unknown) {
    const input = getMessagesSchema.parse(rawInput);
    const state = await communicationState.read();
    const accountIds = new Set(
      state.accounts
        .filter((account) => account.agentId === input.agentId)
        .map((account) => account.accountId),
    );
    const result: MessageView[] = [];

    for (const message of state.messages) {
      if (!accountIds.has(message.accountId)) {
        continue;
      }

      const view = await toMessageView(input.agentId, message);
      if (view.conversationId !== input.conversationId) {
        continue;
      }

      result.push(view);
    }

    result.sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
    const messages = result.slice(-input.limit);
    const unreadKeys = new Set(
      messages.filter((message) => message.unread).map((message) => `${message.accountId}:${message.messageId}`),
    );

    if (unreadKeys.size > 0) {
      for (const message of state.messages) {
        if (!accountIds.has(message.accountId)) {
          continue;
        }

        if (!unreadKeys.has(`${message.accountId}:${message.messageId}`)) {
          continue;
        }

        if (!message.unread) {
          continue;
        }

        message.unread = false;
      }

      await communicationState.save();
    }

    return messages;
  }

  return {
    saveInboundMessage,
    saveOutboundMessage,
    findMessage,
    listMessageConversations,
    getMessages,
  };
}

export const messageStore = createMessageStore();
