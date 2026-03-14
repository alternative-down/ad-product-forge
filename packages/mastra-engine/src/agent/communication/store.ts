import crypto from 'node:crypto';

import { createClient } from '@libsql/client';
import { z } from 'zod';

const accountSchema = z.object({
  accountId: z.string(),
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

const conversationSchema = z.object({
  conversationId: z.string(),
  provider: z.string(),
  providerConversationKey: z.string(),
  name: z.string().optional(),
  contactSlug: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const messageSchema = z.object({
  messageId: z.string(),
  conversationId: z.string(),
  provider: z.string(),
  providerMessageId: z.string().optional(),
  authorExternalId: z.string().optional(),
  authorDisplayName: z.string().optional(),
  authorUsername: z.string().optional(),
  content: z.string(),
  attachments: z.array(attachmentSchema).default([]),
  unread: z.boolean(),
  createdAt: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const stateSchema = z.object({
  accounts: z.array(accountSchema).default([]),
  contacts: z.array(contactSchema).default([]),
  conversations: z.array(conversationSchema).default([]),
  messages: z.array(messageSchema).default([]),
});

type Contact = z.infer<typeof contactSchema>;
type Conversation = z.infer<typeof conversationSchema>;
type MessageRecord = z.infer<typeof messageSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;

export function createCommunicationStore(agentId: string, dbUrl: string) {
  const client = createClient({ url: dbUrl });
  let currentState: z.infer<typeof stateSchema> | null = null;

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

  async function readState() {
    if (currentState) {
      return currentState;
    }

    await client.execute(`
      CREATE TABLE IF NOT EXISTS forge_communication_state (
        agent_id TEXT PRIMARY KEY,
        state TEXT NOT NULL
      )
    `);

    const result = await client.execute({
      sql: 'SELECT state FROM forge_communication_state WHERE agent_id = ?',
      args: [agentId],
    });

    if (!result.rows[0]?.state || typeof result.rows[0].state !== 'string') {
      currentState = stateSchema.parse({});
      await saveState();
      return currentState;
    }

    currentState = stateSchema.parse(JSON.parse(result.rows[0].state));

    return currentState;
  }

  async function saveState() {
    if (!currentState) {
      return;
    }

    await client.execute({
      sql: `
        INSERT INTO forge_communication_state (agent_id, state)
        VALUES (?, ?)
        ON CONFLICT(agent_id) DO UPDATE SET state = excluded.state
      `,
      args: [agentId, JSON.stringify(currentState)],
    });
  }

  async function ensureAccount(input: {
    provider: string;
    externalAccountId: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }) {
    const state = await readState();
    const accountId = `${agentId}:${input.provider}:${input.externalAccountId}`;
    let account = state.accounts.find((current) => current.accountId === accountId);

    if (!account) {
      account = {
        accountId,
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
    return account;
  }

  async function listContacts() {
    return (await readState()).contacts;
  }

  async function getContact(slug: string) {
    return (await readState()).contacts.find((contact) => contact.slug === slug) ?? null;
  }

  async function findContactByIdentity(provider: string, externalUserId?: string, username?: string) {
    const state = await readState();

    return (
      state.contacts.find((contact) =>
        contact.accounts.some((account) => {
          if (account.provider !== provider) {
            return false;
          }

          if (externalUserId && account.externalUserId === externalUserId) {
            return true;
          }

          if (username && account.username === username) {
            return true;
          }

          return false;
        }),
      ) ?? null
    );
  }

  async function upsertContact(input: {
    slug: string;
    displayName: string;
    description?: string;
    provider?: string;
    externalUserId?: string;
    username?: string;
  }) {
    const state = await readState();
    const slug = slugify(input.slug);
    let contact = state.contacts.find((current) => current.slug === slug);

    if (!contact) {
      contact = {
        slug,
        displayName: input.displayName,
        accounts: [],
      };
      state.contacts.push(contact);
    }

    contact.displayName = input.displayName;
    contact.description = input.description;

    if (input.provider) {
      let identity = contact.accounts.find((account) => {
        if (account.provider !== input.provider) {
          return false;
        }

        if (input.externalUserId && account.externalUserId === input.externalUserId) {
          return true;
        }

        if (input.username && account.username === input.username) {
          return true;
        }

        return false;
      });

      if (!identity) {
        identity = {
          provider: input.provider,
          externalUserId: input.externalUserId,
          username: input.username,
        };
        contact.accounts.push(identity);
      }

      if (input.externalUserId) {
        identity.externalUserId = input.externalUserId;
      }

      if (input.username) {
        identity.username = input.username;
      }
    }

    await saveState();
    return contact;
  }

  async function ensureConversation(input: {
    provider: string;
    providerConversationKey: string;
    name?: string;
    contactSlug?: string;
    createdAt?: string;
  }) {
    const state = await readState();
    const now = input.createdAt ?? new Date().toISOString();
    let conversation = state.conversations.find(
      (current) => current.provider === input.provider && current.providerConversationKey === input.providerConversationKey,
    );

    if (!conversation) {
      conversation = {
        conversationId: `conv_${crypto.randomUUID()}`,
        provider: input.provider,
        providerConversationKey: input.providerConversationKey,
        name: input.name,
        contactSlug: input.contactSlug,
        createdAt: now,
        updatedAt: now,
      };
      state.conversations.push(conversation);
      await saveState();
      return conversation;
    }

    if (input.name !== undefined) {
      conversation.name = input.name;
    }

    if (input.contactSlug !== undefined) {
      conversation.contactSlug = input.contactSlug;
    }

    conversation.updatedAt = now;
    await saveState();
    return conversation;
  }

  async function getConversation(conversationId: string) {
    return (await readState()).conversations.find((conversation) => conversation.conversationId === conversationId) ?? null;
  }

  async function findConversationByProvider(provider: string, providerConversationKey: string) {
    return (
      (await readState()).conversations.find(
        (conversation) =>
          conversation.provider === provider && conversation.providerConversationKey === providerConversationKey,
      ) ?? null
    );
  }

  async function saveInboundMessage(input: {
    provider: string;
    providerConversationKey: string;
    providerMessageId: string;
    conversationName?: string;
    contactSlug?: string;
    authorExternalId?: string;
    authorDisplayName?: string;
    authorUsername?: string;
    content: string;
    attachments?: Attachment[];
    createdAt: string;
    metadata?: Record<string, unknown>;
  }) {
    const state = await readState();
    const existing = state.messages.find(
      (message) => message.provider === input.provider && message.providerMessageId === input.providerMessageId,
    );

    if (existing) {
      return existing;
    }

    const conversation = await ensureConversation({
      provider: input.provider,
      providerConversationKey: input.providerConversationKey,
      name: input.conversationName,
      contactSlug: input.contactSlug,
      createdAt: input.createdAt,
    });
    const message = {
      messageId: `msg_${crypto.randomUUID()}`,
      conversationId: conversation.conversationId,
      provider: input.provider,
      providerMessageId: input.providerMessageId,
      authorExternalId: input.authorExternalId,
      authorDisplayName: input.authorDisplayName,
      authorUsername: input.authorUsername,
      content: input.content,
      attachments: input.attachments ?? [],
      unread: true,
      createdAt: input.createdAt,
      metadata: input.metadata,
    };

    state.messages.push(message);
    await saveState();
    return message;
  }

  async function saveOutboundMessage(input: {
    provider: string;
    providerConversationKey: string;
    providerMessageId?: string;
    conversationName?: string;
    contactSlug?: string;
    content: string;
    createdAt?: string;
    metadata?: Record<string, unknown>;
  }) {
    const state = await readState();
    const conversation = await ensureConversation({
      provider: input.provider,
      providerConversationKey: input.providerConversationKey,
      name: input.conversationName,
      contactSlug: input.contactSlug,
      createdAt: input.createdAt,
    });
    const message = {
      messageId: `msg_${crypto.randomUUID()}`,
      conversationId: conversation.conversationId,
      provider: input.provider,
      providerMessageId: input.providerMessageId,
      content: input.content,
      attachments: [],
      unread: false,
      createdAt: input.createdAt ?? new Date().toISOString(),
      metadata: input.metadata,
    };

    state.messages.push(message);
    await saveState();
    return message;
  }

  async function getMessage(messageId: string) {
    return (await readState()).messages.find((message) => message.messageId === messageId) ?? null;
  }

  async function markMessagesRead(messageIds: string[]) {
    if (messageIds.length === 0) {
      return;
    }

    const state = await readState();
    let changed = false;

    for (const message of state.messages) {
      if (messageIds.includes(message.messageId) && message.unread) {
        message.unread = false;
        changed = true;
      }
    }

    if (changed) {
      await saveState();
    }
  }

  async function listConversations(options: { provider?: string; contactSlug?: string; unread?: boolean; limit: number }) {
    const state = await readState();
    const result: Array<Conversation & { unreadCount: number; latestMessageAt: string; messages: MessageRecord[] }> = [];

    for (const conversation of state.conversations) {
      if (options.provider && conversation.provider !== options.provider) {
        continue;
      }

      if (options.contactSlug && conversation.contactSlug !== options.contactSlug) {
        continue;
      }

      const messages = state.messages
        .filter((message) => message.conversationId === conversation.conversationId)
        .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

      if (messages.length === 0) {
        continue;
      }

      const unreadCount = messages.filter((message) => message.unread).length;

      if (options.unread !== undefined && (unreadCount > 0) !== options.unread) {
        continue;
      }

      result.push({
        ...conversation,
        unreadCount,
        latestMessageAt: messages[messages.length - 1]!.createdAt,
        messages: messages.slice(-5),
      });
    }

    result.sort((left, right) => new Date(right.latestMessageAt).getTime() - new Date(left.latestMessageAt).getTime());

    const conversations = result.slice(0, options.limit).map((conversation) => ({
      conversationId: conversation.conversationId,
      provider: conversation.provider,
      latestMessageAt: conversation.latestMessageAt,
      unreadCount: conversation.unreadCount,
      name: conversation.name,
      contactSlug: conversation.contactSlug,
      messages: conversation.messages,
    }));

    await markMessagesRead(
      conversations.flatMap((conversation) => conversation.messages).filter((message) => message.unread).map((message) => message.messageId),
    );

    return conversations;
  }

  async function getMessages(conversationId: string, limit: number) {
    const messages = (await readState()).messages
      .filter((message) => message.conversationId === conversationId)
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      .slice(-limit);

    await markMessagesRead(messages.filter((message) => message.unread).map((message) => message.messageId));
    return messages;
  }

  return {
    ensureAccount,
    listContacts,
    getContact,
    findContactByIdentity,
    upsertContact,
    ensureConversation,
    getConversation,
    findConversationByProvider,
    saveInboundMessage,
    saveOutboundMessage,
    getMessage,
    listConversations,
    getMessages,
  };
}
