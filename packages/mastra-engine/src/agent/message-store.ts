import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

const accountSchema = z.object({
  accountId: z.string(),
  agentId: z.string(),
  provider: z.string(),
  externalAccountId: z.string(),
  displayName: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const contactIdentitySchema = z.object({
  provider: z.string(),
  externalUserId: z.string().optional(),
  username: z.string().optional(),
});

const contactSchema = z.object({
  agentId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  accounts: z.array(contactIdentitySchema).default([]),
});

const attachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  url: z.string(),
  contentType: z.string().optional(),
  sizeBytes: z.number().optional(),
  description: z.string().optional(),
});

const storedMessageSchema = z.object({
  messageId: z.string(),
  accountId: z.string(),
  direction: z.enum(['inbound', 'outbound']),
  channelId: z.string().optional(),
  channelName: z.string().optional(),
  authorId: z.string().optional(),
  authorName: z.string().optional(),
  username: z.string().optional(),
  content: z.string(),
  attachments: z.array(attachmentSchema).default([]),
  unread: z.boolean(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const stateSchema = z.object({
  accounts: z.array(accountSchema).default([]),
  contacts: z.array(contactSchema).default([]),
  messages: z.array(storedMessageSchema).default([]),
});

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
  attachments: z.array(attachmentSchema).default([]),
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

const upsertContactSchema = z.object({
  agentId: z.string(),
  slug: z.string(),
  displayName: z.string(),
  description: z.string().optional(),
  accounts: z.array(contactIdentitySchema).default([]),
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

type Account = z.infer<typeof accountSchema>;
export type ContactIdentity = z.infer<typeof contactIdentitySchema>;
type Contact = z.infer<typeof contactSchema>;
type Attachment = z.infer<typeof attachmentSchema>;
type StoredMessage = z.infer<typeof storedMessageSchema>;
type State = z.infer<typeof stateSchema>;
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
  const statePath = path.resolve('.forge-state', 'accounts.json');
  let currentState: State | null = null;

  async function ensureState() {
    if (currentState) {
      return currentState;
    }

    try {
      const content = await readFile(statePath, 'utf8');
      currentState = stateSchema.parse(JSON.parse(content));
    } catch {
      currentState = stateSchema.parse({});
    }

    return currentState;
  }

  async function saveState() {
    if (!currentState) {
      return;
    }

    await mkdir(path.dirname(statePath), { recursive: true });
    await writeFile(statePath, JSON.stringify(currentState, null, 2), 'utf8');
  }

  function slugify(value: string) {
    return (
      value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-') || 'contact'
    );
  }

  function findContactBySlug(state: State, agentId: string, slug: string) {
    return state.contacts.find((contact) => contact.agentId === agentId && contact.slug === slug) ?? null;
  }

  function findContactByIdentity(
    state: State,
    agentId: string,
    provider: string,
    externalUserId?: string,
    username?: string,
  ) {
    return (
      state.contacts.find((contact) => {
        if (contact.agentId !== agentId) return false;

        return contact.accounts.some((account) => {
          if (account.provider !== provider) return false;
          if (externalUserId && account.externalUserId === externalUserId) return true;
          if (username && account.username === username) return true;
          return false;
        });
      }) ?? null
    );
  }

  function getMessageConversationId(state: State, agentId: string, account: Account, message: StoredMessage) {
    const contact = findContactByIdentity(
      state,
      agentId,
      account.provider,
      message.authorId,
      message.username,
    );

    return `${account.provider}:${message.channelId || contact?.slug || message.authorId || message.messageId}`;
  }

  function toMessageView(state: State, agentId: string, message: StoredMessage): MessageView {
    const account = state.accounts.find((current) => current.accountId === message.accountId);

    if (!account) {
      throw new Error(`Account not found for message: ${message.accountId}`);
    }

    const contact = findContactByIdentity(
      state,
      agentId,
      account.provider,
      message.authorId,
      message.username,
    );

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
      conversationId: getMessageConversationId(state, agentId, account, message),
    };
  }

  async function ensureAccount(input: {
    agentId: string;
    provider: string;
    externalAccountId: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }) {
    const state = await ensureState();
    const accountId = `${input.agentId}:${input.provider}:${input.externalAccountId}`;
    let account = state.accounts.find((current) => current.accountId === accountId);

    if (!account) {
      account = {
        accountId,
        agentId: input.agentId,
        provider: input.provider,
        externalAccountId: input.externalAccountId,
      };
      state.accounts.push(account);
    }

    if (input.displayName !== undefined) {
      account.displayName = input.displayName;
    }

    if (input.metadata !== undefined) {
      account.metadata = input.metadata;
    }

    await saveState();
    return accountId;
  }

  async function saveInboundMessage(rawInput: unknown) {
    const input = inboundMessageSchema.parse(rawInput);
    const state = await ensureState();
    const account = state.accounts.find((current) => current.accountId === input.accountId);

    if (!account) {
      throw new Error(`Account not found for inbound message: ${input.accountId}`);
    }

    const alreadyExists = state.messages.some(
      (message) => message.accountId === input.accountId && message.messageId === input.messageId,
    );

    if (alreadyExists) {
      return;
    }

    if (input.authorId || input.username || input.authorName) {
      let contact = findContactByIdentity(state, input.agentId, account.provider, input.authorId, input.username);

      if (!contact) {
        const baseSlug = slugify(input.username || input.authorName || input.authorId || 'contact');
        let slug = baseSlug;
        let suffix = 2;

        while (findContactBySlug(state, input.agentId, slug)) {
          slug = `${baseSlug}-${suffix}`;
          suffix += 1;
        }

        contact = {
          agentId: input.agentId,
          slug,
          displayName: input.authorName || input.username || input.authorId || slug,
          accounts: [],
        };
        state.contacts.push(contact);
      }

      let identity = contact.accounts.find((current) => {
        if (current.provider !== account.provider) return false;
        if (input.authorId && current.externalUserId === input.authorId) return true;
        if (input.username && current.username === input.username) return true;
        return false;
      });

      if (!identity) {
        identity = {
          provider: account.provider,
          externalUserId: input.authorId,
          username: input.username,
        };
        contact.accounts.push(identity);
      }

      if (input.authorId) identity.externalUserId = input.authorId;
      if (input.username) identity.username = input.username;
      if (input.authorName) contact.displayName = input.authorName;
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

    await saveState();
  }

  async function saveOutboundMessage(rawInput: unknown) {
    const input = outboundMessageSchema.parse(rawInput);
    const state = await ensureState();

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

    await saveState();
  }

  async function listAgentContacts(agentId: string) {
    const state = await ensureState();
    return state.contacts.filter((contact) => contact.agentId === agentId);
  }

  async function getAgentContact(agentId: string, slug: string) {
    const state = await ensureState();
    return findContactBySlug(state, agentId, slug);
  }

  async function upsertAgentContact(rawInput: unknown) {
    const input = upsertContactSchema.parse(rawInput);
    const state = await ensureState();
    const slug = slugify(input.slug);
    let contact = findContactBySlug(state, input.agentId, slug);

    if (!contact) {
      contact = {
        agentId: input.agentId,
        slug,
        displayName: input.displayName,
        accounts: [],
      };
      state.contacts.push(contact);
    }

    contact.displayName = input.displayName;
    contact.description = input.description;

    for (const nextIdentity of input.accounts) {
      let identity = contact.accounts.find((current) => {
        if (current.provider !== nextIdentity.provider) return false;
        if (nextIdentity.externalUserId && current.externalUserId === nextIdentity.externalUserId) return true;
        if (nextIdentity.username && current.username === nextIdentity.username) return true;
        return false;
      });

      if (!identity) {
        identity = {
          provider: nextIdentity.provider,
          externalUserId: nextIdentity.externalUserId,
          username: nextIdentity.username,
        };
        contact.accounts.push(identity);
      }

      if (nextIdentity.externalUserId) identity.externalUserId = nextIdentity.externalUserId;
      if (nextIdentity.username) identity.username = nextIdentity.username;
    }

    await saveState();
    return contact;
  }

  async function listMessageConversations(rawInput: unknown) {
    const input = listConversationsSchema.parse(rawInput);
    const state = await ensureState();
    const accountIds = new Set(
      state.accounts
        .filter((account) => account.agentId === input.agentId)
        .filter((account) => !input.provider || account.provider === input.provider)
        .map((account) => account.accountId),
    );
    const conversations = new Map<string, ConversationView>();

    for (const message of state.messages) {
      if (!accountIds.has(message.accountId)) continue;
      if (input.unread !== undefined && message.unread !== input.unread) continue;

      const view = toMessageView(state, input.agentId, message);
      if (input.contactSlug && view.contactSlug !== input.contactSlug) continue;

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
      if (view.unread) conversation.unreadCount += 1;
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
        if (!accountIds.has(message.accountId)) continue;
        if (!unreadKeys.has(`${message.accountId}:${message.messageId}`)) continue;
        if (!message.unread) continue;
        message.unread = false;
      }

      await saveState();
    }

    return result;
  }

  async function getMessages(rawInput: unknown) {
    const input = getMessagesSchema.parse(rawInput);
    const state = await ensureState();
    const accountIds = new Set(
      state.accounts
        .filter((account) => account.agentId === input.agentId)
        .map((account) => account.accountId),
    );
    const result = state.messages
      .filter((message) => accountIds.has(message.accountId))
      .map((message) => toMessageView(state, input.agentId, message))
      .filter((message) => message.conversationId === input.conversationId)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      .slice(-input.limit);
    const unreadKeys = new Set(
      result
        .filter((message) => message.unread)
        .map((message) => `${message.accountId}:${message.messageId}`),
    );

    if (unreadKeys.size > 0) {
      for (const message of state.messages) {
        if (!accountIds.has(message.accountId)) continue;
        if (!unreadKeys.has(`${message.accountId}:${message.messageId}`)) continue;
        if (!message.unread) continue;
        message.unread = false;
      }

      await saveState();
    }

    return result;
  }

  async function getAgentProviderAccount(agentId: string, provider: string) {
    const state = await ensureState();
    return state.accounts.find((account) => account.agentId === agentId && account.provider === provider) ?? null;
  }

  async function findMessage(accountId: string, messageId: string) {
    const state = await ensureState();
    return state.messages.find((message) => message.accountId === accountId && message.messageId === messageId) ?? null;
  }

  async function findContact(agentId: string, slug: string) {
    const state = await ensureState();
    return findContactBySlug(state, agentId, slug);
  }

  return {
    ensureAccount,
    saveInboundMessage,
    saveOutboundMessage,
    listAgentContacts,
    getAgentContact,
    upsertAgentContact,
    listMessageConversations,
    getMessages,
    getAgentProviderAccount,
    findMessage,
    findContact,
  };
}

export const messageStore = createMessageStore();
