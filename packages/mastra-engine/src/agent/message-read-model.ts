import { z } from 'zod';

import { contactBook } from './contact-book';
import { messageState, type ContactIdentity, type State, type StoredMessage } from './message-state';
import type { ConversationView, MessageView } from './message-types';

const listConversationsInputSchema = z.object({
  agentId: z.string(),
  provider: z.string().optional(),
  contactSlug: z.string().optional(),
  unread: z.boolean().optional(),
  limit: z.number().int().positive().max(100).default(20),
});

const getMessagesInputSchema = z.object({
  agentId: z.string(),
  conversationId: z.string(),
  limit: z.number().int().positive().max(200).default(100),
});

export function createMessageReadModel(dependencies: {
  getAgentAccountIds(state: State, agentId: string, provider?: string): Set<string>;
}) {
  function buildMessageView(state: State, agentId: string, storedMessage: StoredMessage): MessageView {
    const account = state.accounts.find((current) => current.accountId === storedMessage.accountId);

    if (!account) {
      throw new Error(`Account not found for message: ${storedMessage.accountId}`);
    }

    const contact = contactBook.findContactByIdentity(
      state,
      agentId,
      account.provider,
      storedMessage.authorId,
      storedMessage.username,
    );
    const conversationId = `${account.provider}:${storedMessage.channelId || contact?.slug || storedMessage.authorId || storedMessage.messageId}`;

    return {
      messageId: storedMessage.messageId,
      accountId: storedMessage.accountId,
      direction: storedMessage.direction,
      provider: account.provider,
      channelId: storedMessage.channelId,
      channelName: storedMessage.channelName,
      authorId: storedMessage.authorId,
      authorName: storedMessage.authorName,
      username: storedMessage.username,
      content: storedMessage.content,
      attachments: storedMessage.attachments,
      unread: storedMessage.unread,
      createdAt: storedMessage.createdAt,
      metadata: storedMessage.metadata,
      contactSlug: contact?.slug,
      contactDisplayName: contact?.displayName,
      conversationId,
    };
  }

  async function listAgentContacts(agentId: string) {
    const state = await messageState.load();
    return state.contacts.filter((contact) => contact.agentId === agentId);
  }

  async function getAgentContact(agentId: string, slug: string) {
    const state = await messageState.load();
    return contactBook.findContactBySlug(state, agentId, slug);
  }

  async function upsertAgentContact(input: {
    agentId: string;
    slug: string;
    displayName: string;
    description?: string;
    accounts?: ContactIdentity[];
  }) {
    return messageState.update((state) => contactBook.upsertContact(state, input));
  }

  async function listMessageConversations(input: z.input<typeof listConversationsInputSchema>) {
    const parsed = listConversationsInputSchema.parse(input);
    const state = await messageState.load();
    const accountIds = dependencies.getAgentAccountIds(state, parsed.agentId, parsed.provider);
    const conversations = new Map<string, ConversationView>();

    for (const storedMessage of state.messages) {
      if (!accountIds.has(storedMessage.accountId)) continue;
      if (parsed.unread !== undefined && storedMessage.unread !== parsed.unread) continue;

      const message = buildMessageView(state, parsed.agentId, storedMessage);
      if (parsed.contactSlug && message.contactSlug !== parsed.contactSlug) continue;

      let conversation = conversations.get(message.conversationId);

      if (!conversation) {
        conversation = {
          conversationId: message.conversationId,
          provider: message.provider,
          channelId: message.channelId,
          channelName: message.channelName,
          contactSlug: message.contactSlug,
          contactDisplayName: message.contactDisplayName,
          latestMessageAt: message.createdAt,
          unreadCount: 0,
          messages: [],
        };
        conversations.set(message.conversationId, conversation);
      }

      conversation.messages.push(message);
      conversation.latestMessageAt = message.createdAt;
      if (message.unread) conversation.unreadCount += 1;
    }

    const result = Array.from(conversations.values())
      .sort((left, right) => new Date(right.latestMessageAt).getTime() - new Date(left.latestMessageAt).getTime())
      .slice(0, parsed.limit)
      .map((conversation) => ({
        ...conversation,
        messages: conversation.messages
          .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
          .slice(-5),
      }));
    const unreadMessages = result.flatMap((conversation) => conversation.messages).filter((message) => message.unread);

    if (unreadMessages.length > 0) {
      await messageState.update((latestState) => {
        const unreadKeys = new Set(unreadMessages.map((message) => `${message.accountId}:${message.messageId}`));

        for (const message of latestState.messages) {
          if (!accountIds.has(message.accountId)) continue;
          if (!unreadKeys.has(`${message.accountId}:${message.messageId}`)) continue;
          if (!message.unread) continue;
          message.unread = false;
        }
      });
    }

    return result;
  }

  async function getMessages(input: z.input<typeof getMessagesInputSchema>) {
    const parsed = getMessagesInputSchema.parse(input);
    const state = await messageState.load();
    const accountIds = dependencies.getAgentAccountIds(state, parsed.agentId);
    const result = state.messages
      .filter((storedMessage) => accountIds.has(storedMessage.accountId))
      .map((storedMessage) => buildMessageView(state, parsed.agentId, storedMessage))
      .filter((message) => message.conversationId === parsed.conversationId)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      .slice(-parsed.limit);
    const unreadMessages = result.filter((message) => message.unread);

    if (unreadMessages.length > 0) {
      await messageState.update((latestState) => {
        const unreadKeys = new Set(unreadMessages.map((message) => `${message.accountId}:${message.messageId}`));

        for (const message of latestState.messages) {
          if (!accountIds.has(message.accountId)) continue;
          if (!unreadKeys.has(`${message.accountId}:${message.messageId}`)) continue;
          if (!message.unread) continue;
          message.unread = false;
        }
      });
    }

    return result;
  }

  return {
    listAgentContacts,
    getAgentContact,
    upsertAgentContact,
    listMessageConversations,
    getMessages,
  };
}
