import crypto from 'node:crypto';

import type { Client } from '@libsql/client';
import { z } from 'zod';

const attachmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  url: z.string(),
  contentType: z.string().optional(),
  sizeBytes: z.number().optional(),
  description: z.string().optional(),
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

type Contact = z.infer<typeof contactSchema>;
type Conversation = z.infer<typeof conversationSchema>;
type MessageRecord = z.infer<typeof messageSchema>;
export type Attachment = z.infer<typeof attachmentSchema>;

export async function createCommunicationStore(client: Client) {
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

  await client.execute(`
    CREATE TABLE IF NOT EXISTS forge_communication_accounts (
      account_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      external_account_id TEXT NOT NULL,
      display_name TEXT,
      metadata_json TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS forge_communication_contacts (
      slug TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      description TEXT
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS forge_communication_contact_accounts (
      slug TEXT NOT NULL,
      provider TEXT NOT NULL,
      external_user_id TEXT,
      username TEXT,
      UNIQUE (slug, provider, external_user_id, username)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS forge_communication_conversations (
      conversation_id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      provider_conversation_key TEXT NOT NULL,
      name TEXT,
      contact_slug TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (provider, provider_conversation_key)
    )
  `);
  await client.execute(`
    CREATE TABLE IF NOT EXISTS forge_communication_messages (
      message_id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      provider_message_id TEXT,
      author_external_id TEXT,
      author_display_name TEXT,
      author_username TEXT,
      content TEXT NOT NULL,
      attachments_json TEXT NOT NULL,
      unread INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      metadata_json TEXT,
      UNIQUE (provider, provider_message_id)
    )
  `);
  // Ensure unique index exists on existing tables that predate the UNIQUE constraint
  await client.execute(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_provider_message_id
    ON forge_communication_messages (provider, provider_message_id)
    WHERE provider_message_id IS NOT NULL
  `);

  async function loadContact(slug: string) {
    const contactResult = await client.execute({
      sql: `
        SELECT slug, display_name, description
        FROM forge_communication_contacts
        WHERE slug = ?
      `,
      args: [slug],
    });

    if (!contactResult.rows[0]) {
      return null;
    }

    const accountResult = await client.execute({
      sql: `
        SELECT provider, external_user_id, username
        FROM forge_communication_contact_accounts
        WHERE slug = ?
      `,
      args: [slug],
    });

    return contactSchema.parse({
      slug: String(contactResult.rows[0].slug),
      displayName: String(contactResult.rows[0].display_name),
      description:
        typeof contactResult.rows[0].description === 'string' ? String(contactResult.rows[0].description) : undefined,
      accounts: accountResult.rows.map((row) => ({
        provider: String(row.provider),
        externalUserId: typeof row.external_user_id === 'string' ? String(row.external_user_id) : undefined,
        username: typeof row.username === 'string' ? String(row.username) : undefined,
      })),
    });
  }

  async function loadConversation(conversationId: string) {
    const result = await client.execute({
      sql: `
        SELECT conversation_id, provider, provider_conversation_key, name, contact_slug, created_at, updated_at
        FROM forge_communication_conversations
        WHERE conversation_id = ?
      `,
      args: [conversationId],
    });

    if (!result.rows[0]) {
      return null;
    }

    return conversationSchema.parse({
      conversationId: String(result.rows[0].conversation_id),
      provider: String(result.rows[0].provider),
      providerConversationKey: String(result.rows[0].provider_conversation_key),
      name: typeof result.rows[0].name === 'string' ? String(result.rows[0].name) : undefined,
      contactSlug: typeof result.rows[0].contact_slug === 'string' ? String(result.rows[0].contact_slug) : undefined,
      createdAt: String(result.rows[0].created_at),
      updatedAt: String(result.rows[0].updated_at),
    });
  }

  async function loadMessage(messageId: string) {
    const result = await client.execute({
      sql: `
        SELECT
          message_id,
          conversation_id,
          provider,
          provider_message_id,
          author_external_id,
          author_display_name,
          author_username,
          content,
          attachments_json,
          unread,
          created_at,
          metadata_json
        FROM forge_communication_messages
        WHERE message_id = ?
      `,
      args: [messageId],
    });

    if (!result.rows[0]) {
      return null;
    }

    return messageSchema.parse({
      messageId: String(result.rows[0].message_id),
      conversationId: String(result.rows[0].conversation_id),
      provider: String(result.rows[0].provider),
      providerMessageId:
        typeof result.rows[0].provider_message_id === 'string' ? String(result.rows[0].provider_message_id) : undefined,
      authorExternalId:
        typeof result.rows[0].author_external_id === 'string' ? String(result.rows[0].author_external_id) : undefined,
      authorDisplayName:
        typeof result.rows[0].author_display_name === 'string' ? String(result.rows[0].author_display_name) : undefined,
      authorUsername:
        typeof result.rows[0].author_username === 'string' ? String(result.rows[0].author_username) : undefined,
      content: String(result.rows[0].content),
      attachments: attachmentSchema.array().parse(JSON.parse(String(result.rows[0].attachments_json))),
      unread: Number(result.rows[0].unread) === 1,
      createdAt: String(result.rows[0].created_at),
      metadata:
        typeof result.rows[0].metadata_json === 'string'
          ? z.record(z.string(), z.unknown()).parse(JSON.parse(String(result.rows[0].metadata_json)))
          : undefined,
    });
  }

  async function ensureAccount(input: {
    provider: string;
    externalAccountId: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }) {
    const accountId = `${input.provider}:${input.externalAccountId}`;

    await client.execute({
      sql: `
        INSERT INTO forge_communication_accounts (
          account_id,
          provider,
          external_account_id,
          display_name,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(account_id) DO UPDATE SET
          display_name = COALESCE(excluded.display_name, forge_communication_accounts.display_name),
          metadata_json = COALESCE(excluded.metadata_json, forge_communication_accounts.metadata_json)
      `,
      args: [
        accountId,
        input.provider,
        input.externalAccountId,
        input.displayName ?? null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    });

    return {
      accountId,
      provider: input.provider,
      externalAccountId: input.externalAccountId,
      displayName: input.displayName,
      metadata: input.metadata,
    };
  }

  async function listContacts() {
    const result = await client.execute(`
      SELECT slug
      FROM forge_communication_contacts
      ORDER BY display_name ASC, slug ASC
    `);

    const contacts = await Promise.all(result.rows.map((row) => loadContact(String(row.slug))));

    return contacts.filter((contact): contact is Contact => Boolean(contact));
  }

  async function listSelfAccounts() {
    const result = await client.execute(`
      SELECT account_id, provider, external_account_id, display_name, metadata_json
      FROM forge_communication_accounts
      ORDER BY provider ASC
    `);

    return result.rows.map((row) => ({
      accountId: String(row.account_id),
      provider: String(row.provider),
      externalAccountId: String(row.external_account_id),
      displayName: typeof row.display_name === 'string' ? row.display_name : undefined,
    }));
  }

  async function getContact(slug: string) {
    return loadContact(slugify(slug));
  }

  async function findContactByIdentity(provider: string, externalUserId?: string, username?: string) {
    if (!externalUserId && !username) {
      return null;
    }

    const result = await client.execute({
      sql: `
        SELECT slug
        FROM forge_communication_contact_accounts
        WHERE provider = ?
          AND (
            (? IS NOT NULL AND external_user_id = ?)
            OR (? IS NOT NULL AND username = ?)
          )
        LIMIT 1
      `,
      args: [provider, externalUserId ?? null, externalUserId ?? null, username ?? null, username ?? null],
    });

    if (!result.rows[0]?.slug || typeof result.rows[0].slug !== 'string') {
      return null;
    }

    return loadContact(String(result.rows[0].slug));
  }

  async function upsertContact(input: {
    slug: string;
    displayName: string;
    description?: string;
    provider?: string;
    externalUserId?: string;
    username?: string;
  }) {
    const slug = slugify(input.slug);

    await client.execute({
      sql: `
        INSERT INTO forge_communication_contacts (slug, display_name, description)
        VALUES (?, ?, ?)
        ON CONFLICT(slug) DO UPDATE SET
          display_name = excluded.display_name,
          description = excluded.description
      `,
      args: [slug, input.displayName, input.description ?? null],
    });

    if (input.provider && (input.externalUserId || input.username)) {
      await client.execute({
        sql: `
          INSERT INTO forge_communication_contact_accounts (
            slug,
            provider,
            external_user_id,
            username
          ) VALUES (?, ?, ?, ?)
          ON CONFLICT(slug, provider, external_user_id, username) DO NOTHING
        `,
        args: [slug, input.provider, input.externalUserId ?? null, input.username ?? null],
      });
    }

    return loadContact(slug);
  }

  async function ensureConversation(input: {
    provider: string;
    providerConversationKey: string;
    name?: string;
    contactSlug?: string;
    createdAt?: string;
  }) {
    const now = input.createdAt ?? new Date().toISOString();
    const existingResult = await client.execute({
      sql: `
        SELECT conversation_id
        FROM forge_communication_conversations
        WHERE provider = ? AND provider_conversation_key = ?
        LIMIT 1
      `,
      args: [input.provider, input.providerConversationKey],
    });

    if (existingResult.rows[0]?.conversation_id && typeof existingResult.rows[0].conversation_id === 'string') {
      const conversationId = String(existingResult.rows[0].conversation_id);

      await client.execute({
        sql: `
          UPDATE forge_communication_conversations
          SET
            name = COALESCE(?, name),
            contact_slug = COALESCE(?, contact_slug),
            updated_at = ?
          WHERE conversation_id = ?
        `,
        args: [input.name ?? null, input.contactSlug ?? null, now, conversationId],
      });

      return loadConversation(conversationId);
    }

    const conversationId = `conv_${crypto.randomUUID()}`;

    await client.execute({
      sql: `
        INSERT INTO forge_communication_conversations (
          conversation_id,
          provider,
          provider_conversation_key,
          name,
          contact_slug,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        conversationId,
        input.provider,
        input.providerConversationKey,
        input.name ?? null,
        input.contactSlug ?? null,
        now,
        now,
      ],
    });

    return loadConversation(conversationId);
  }

  async function getConversation(conversationId: string) {
    return loadConversation(conversationId);
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
    const conversation = await ensureConversation({
      provider: input.provider,
      providerConversationKey: input.providerConversationKey,
      name: input.conversationName,
      contactSlug: input.contactSlug,
      createdAt: input.createdAt,
    });

    if (!conversation) {
      throw new Error('Failed to create inbound conversation');
    }

    const messageId = `msg_${crypto.randomUUID()}`;

    await client.execute({
      sql: `
        INSERT INTO forge_communication_messages (
          message_id,
          conversation_id,
          provider,
          provider_message_id,
          author_external_id,
          author_display_name,
          author_username,
          content,
          attachments_json,
          unread,
          created_at,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_message_id) DO NOTHING
      `,
      args: [
        messageId,
        conversation.conversationId,
        input.provider,
        input.providerMessageId,
        input.authorExternalId ?? null,
        input.authorDisplayName ?? null,
        input.authorUsername ?? null,
        input.content,
        JSON.stringify(input.attachments ?? []),
        1,
        input.createdAt,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    });

    const existingResult = await client.execute({
      sql: `
        SELECT message_id
        FROM forge_communication_messages
        WHERE provider = ? AND provider_message_id = ?
        LIMIT 1
      `,
      args: [input.provider, input.providerMessageId],
    });

    if (!existingResult.rows[0]?.message_id || typeof existingResult.rows[0].message_id !== 'string') {
      throw new Error('Failed to save inbound message');
    }

    return loadMessage(String(existingResult.rows[0].message_id));
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
    const conversation = await ensureConversation({
      provider: input.provider,
      providerConversationKey: input.providerConversationKey,
      name: input.conversationName,
      contactSlug: input.contactSlug,
      createdAt: input.createdAt,
    });

    if (!conversation) {
      throw new Error('Failed to create outbound conversation');
    }

    const messageId = `msg_${crypto.randomUUID()}`;

    await client.execute({
      sql: `
        INSERT INTO forge_communication_messages (
          message_id,
          conversation_id,
          provider,
          provider_message_id,
          content,
          attachments_json,
          unread,
          created_at,
          metadata_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        messageId,
        conversation.conversationId,
        input.provider,
        input.providerMessageId ?? null,
        input.content,
        JSON.stringify([]),
        0,
        input.createdAt ?? new Date().toISOString(),
        input.metadata ? JSON.stringify(input.metadata) : null,
      ],
    });

    return loadMessage(messageId);
  }

  async function getMessage(messageId: string) {
    return loadMessage(messageId);
  }

  async function markMessagesRead(messageIds: string[]) {
    if (messageIds.length === 0) {
      return;
    }

    for (const messageId of messageIds) {
      await client.execute({
        sql: `
          UPDATE forge_communication_messages
          SET unread = 0
          WHERE message_id = ? AND unread = 1
        `,
        args: [messageId],
      });
    }
  }

  async function listConversations(options: { provider?: string; contactSlug?: string; unread?: boolean; limit: number }) {
    const conversationResult = await client.execute(`
      SELECT conversation_id
      FROM forge_communication_conversations
    `);

    const conversationIds = conversationResult.rows.map((row) => String(row.conversation_id));

    if (conversationIds.length === 0) {
      return [];
    }

    // Load all messages in bulk using IN clause
    const placeholders = conversationIds.map(() => '?').join(',');
    const messagesResult = await client.execute({
      sql: `
        SELECT message_id
        FROM forge_communication_messages
        WHERE conversation_id IN (${placeholders})
        ORDER BY created_at ASC
      `,
      args: conversationIds,
    });

    const allMessages = await Promise.all(
      messagesResult.rows.map((row) => loadMessage(String(row.message_id)))
    );

    const messagesByConversation = new Map<string, MessageRecord[]>();
    for (const message of allMessages) {
      if (message) {
        if (!messagesByConversation.has(message.conversationId)) {
          messagesByConversation.set(message.conversationId, []);
        }
        messagesByConversation.get(message.conversationId)!.push(message);
      }
    }

    const conversations = (
      await Promise.all(
        conversationIds.map(async (conversationId) => {
          const conversation = await loadConversation(conversationId);

          if (!conversation) {
            return null;
          }

          if (options.provider && conversation.provider !== options.provider) {
            return null;
          }

          if (options.contactSlug && conversation.contactSlug !== options.contactSlug) {
            return null;
          }

          const messages = messagesByConversation.get(conversationId) || [];
          const recentMessages = messages.slice(-5);

          if (recentMessages.length === 0) {
            return null;
          }

          const unreadCount = recentMessages.filter((message) => message.unread).length;

          if (options.unread !== undefined && (unreadCount > 0) !== options.unread) {
            return null;
          }

          // Mark messages as read
          await markMessagesRead(recentMessages.filter((message) => message.unread).map((message) => message.messageId));

          return {
            ...conversation,
            unreadCount,
            latestMessageAt: recentMessages[recentMessages.length - 1]!.createdAt,
            messages: recentMessages,
          };
        }),
      )
    ).filter(
      (
        conversation,
      ): conversation is Conversation & { unreadCount: number; latestMessageAt: string; messages: MessageRecord[] } =>
        Boolean(conversation),
    );

    conversations.sort((left, right) => new Date(right.latestMessageAt).getTime() - new Date(left.latestMessageAt).getTime());

    return conversations.slice(0, options.limit);
  }

  async function getMessages(conversationId: string, limit: number) {
    const result = await client.execute({
      sql: `
        SELECT message_id
        FROM forge_communication_messages
        WHERE conversation_id = ?
        ORDER BY created_at ASC
      `,
      args: [conversationId],
    });

    const messages = (
      await Promise.all(result.rows.map((row) => loadMessage(String(row.message_id))))
    ).filter((message): message is MessageRecord => Boolean(message));

    const recentMessages = messages.slice(-limit);

    await markMessagesRead(recentMessages.filter((message) => message.unread).map((message) => message.messageId));

    return recentMessages;
  }

  return {
    ensureAccount,
    listSelfAccounts,
    listContacts,
    getContact,
    findContactByIdentity,
    upsertContact,
    ensureConversation,
    getConversation,
    saveInboundMessage,
    saveOutboundMessage,
    getMessage,
    listConversations,
    getMessages,
  };
}
