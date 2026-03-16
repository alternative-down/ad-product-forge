import crypto from 'node:crypto';

import { z } from 'zod';
import { eq, and, inArray, or, isNotNull } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import * as schema from './schema';

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

export async function createCommunicationStore(db: LibSQLDatabase<typeof schema>) {
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

  async function loadContact(slug: string) {
    const contact = await db.query.communicationContacts.findFirst({
      where: eq(schema.communicationContacts.slug, slug),
      with: {
        accounts: true,
      },
    });

    if (!contact) {
      return null;
    }

    return contactSchema.parse({
      slug: contact.slug,
      displayName: contact.displayName,
      description: contact.description ?? undefined,
      accounts: contact.accounts.map((account) => ({
        provider: account.provider,
        externalUserId: account.externalUserId ?? undefined,
        username: account.username ?? undefined,
      })),
    });
  }

  async function loadConversation(conversationId: string) {
    const conversation = await db.query.communicationConversations.findFirst({
      where: eq(schema.communicationConversations.conversationId, conversationId),
    });

    if (!conversation) {
      return null;
    }

    return conversationSchema.parse({
      conversationId: conversation.conversationId,
      provider: conversation.provider,
      providerConversationKey: conversation.providerConversationKey,
      name: conversation.name ?? undefined,
      contactSlug: conversation.contactSlug ?? undefined,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    });
  }

  async function loadMessage(messageId: string) {
    const message = await db.query.communicationMessages.findFirst({
      where: eq(schema.communicationMessages.messageId, messageId),
    });

    if (!message) {
      return null;
    }

    return messageSchema.parse({
      messageId: message.messageId,
      conversationId: message.conversationId,
      provider: message.provider,
      providerMessageId: message.providerMessageId ?? undefined,
      authorExternalId: message.authorExternalId ?? undefined,
      authorDisplayName: message.authorDisplayName ?? undefined,
      authorUsername: message.authorUsername ?? undefined,
      content: message.content,
      attachments: JSON.parse(message.attachmentsJson),
      unread: message.unread === 1,
      createdAt: message.createdAt,
      metadata: message.metadataJson ? JSON.parse(message.metadataJson) : undefined,
    });
  }

  async function ensureAccount(input: {
    provider: string;
    externalAccountId: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
  }) {
    const accountId = `${input.provider}:${input.externalAccountId}`;

    await db
      .insert(schema.communicationAccounts)
      .values({
        accountId,
        provider: input.provider,
        externalAccountId: input.externalAccountId,
        displayName: input.displayName ?? null,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      })
      .onConflictDoUpdate({
        target: schema.communicationAccounts.accountId,
        set: {
          displayName: input.displayName ?? null,
          metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
        },
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
    const contacts = await db.query.communicationContacts.findMany({
      orderBy: (table) => [schema.communicationContacts.displayName, schema.communicationContacts.slug],
      with: {
        accounts: true,
      },
    });

    return Promise.all(
      contacts.map(async (contact) => {
        return contactSchema.parse({
          slug: contact.slug,
          displayName: contact.displayName,
          description: contact.description ?? undefined,
          accounts: contact.accounts.map((account) => ({
            provider: account.provider,
            externalUserId: account.externalUserId ?? undefined,
            username: account.username ?? undefined,
          })),
        });
      }),
    );
  }

  async function listSelfAccounts() {
    const accounts = await db.query.communicationAccounts.findMany({
      orderBy: (table) => schema.communicationAccounts.provider,
    });

    return accounts.map((account) => ({
      accountId: account.accountId,
      provider: account.provider,
      externalAccountId: account.externalAccountId,
      displayName: account.displayName ?? undefined,
    }));
  }

  async function getContact(slug: string) {
    return loadContact(slugify(slug));
  }

  async function findContactByIdentity(provider: string, externalUserId?: string, username?: string) {
    if (!externalUserId && !username) {
      return null;
    }

    const contactAccount = await db.query.communicationContactAccounts.findFirst({
      where: and(
        eq(schema.communicationContactAccounts.provider, provider),
        or(
          externalUserId ? eq(schema.communicationContactAccounts.externalUserId, externalUserId) : undefined,
          username ? eq(schema.communicationContactAccounts.username, username) : undefined,
        ),
      ),
    });

    if (!contactAccount) {
      return null;
    }

    return loadContact(contactAccount.slug);
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

    await db
      .insert(schema.communicationContacts)
      .values({
        slug,
        displayName: input.displayName,
        description: input.description ?? null,
      })
      .onConflictDoUpdate({
        target: schema.communicationContacts.slug,
        set: {
          displayName: input.displayName,
          description: input.description ?? null,
        },
      });

    if (input.provider && (input.externalUserId || input.username)) {
      await db
        .insert(schema.communicationContactAccounts)
        .values({
          slug,
          provider: input.provider,
          externalUserId: input.externalUserId ?? null,
          username: input.username ?? null,
        })
        .onConflictDoNothing();
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

    const existing = await db.query.communicationConversations.findFirst({
      where: and(
        eq(schema.communicationConversations.provider, input.provider),
        eq(schema.communicationConversations.providerConversationKey, input.providerConversationKey),
      ),
    });

    if (existing) {
      await db
        .update(schema.communicationConversations)
        .set({
          name: input.name ?? existing.name,
          contactSlug: input.contactSlug ?? existing.contactSlug,
          updatedAt: now,
        })
        .where(eq(schema.communicationConversations.conversationId, existing.conversationId));

      return loadConversation(existing.conversationId);
    }

    const conversationId = `conv_${crypto.randomUUID()}`;

    await db.insert(schema.communicationConversations).values({
      conversationId,
      provider: input.provider,
      providerConversationKey: input.providerConversationKey,
      name: input.name ?? null,
      contactSlug: input.contactSlug ?? null,
      createdAt: now,
      updatedAt: now,
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

    await db
      .insert(schema.communicationMessages)
      .values({
        messageId,
        conversationId: conversation.conversationId,
        provider: input.provider,
        providerMessageId: input.providerMessageId,
        authorExternalId: input.authorExternalId ?? null,
        authorDisplayName: input.authorDisplayName ?? null,
        authorUsername: input.authorUsername ?? null,
        content: input.content,
        attachmentsJson: JSON.stringify(input.attachments ?? []),
        unread: 1,
        createdAt: input.createdAt,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      })
      .onConflictDoNothing();

    return loadMessage(messageId);
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

    await db.insert(schema.communicationMessages).values({
      messageId,
      conversationId: conversation.conversationId,
      provider: input.provider,
      providerMessageId: input.providerMessageId ?? null,
      authorExternalId: null,
      authorDisplayName: null,
      authorUsername: null,
      content: input.content,
      attachmentsJson: JSON.stringify([]),
      unread: 0,
      createdAt: input.createdAt ?? new Date().toISOString(),
      metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
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

    await db
      .update(schema.communicationMessages)
      .set({ unread: 0 })
      .where(and(inArray(schema.communicationMessages.messageId, messageIds), eq(schema.communicationMessages.unread, 1)));
  }

  async function listConversations(options: { provider?: string; contactSlug?: string; unread?: boolean; limit: number }) {
    const conversations = await db.query.communicationConversations.findMany({
      with: {
        messages: {
          orderBy: (table) => schema.communicationMessages.createdAt,
        },
      },
    });

    const filteredConversations = conversations
      .map((conv) => {
        const recentMessages = conv.messages.slice(-5);

        if (options.provider && conv.provider !== options.provider) {
          return null;
        }

        if (options.contactSlug && conv.contactSlug !== options.contactSlug) {
          return null;
        }

        if (recentMessages.length === 0) {
          return null;
        }

        const unreadCount = recentMessages.filter((msg) => msg.unread === 1).length;

        if (options.unread !== undefined && (unreadCount > 0) !== options.unread) {
          return null;
        }

        return {
          ...conv,
          unreadCount,
          latestMessageAt: recentMessages[recentMessages.length - 1]!.createdAt,
          recentMessages,
        };
      })
      .filter((c): c is typeof conversations[number] & { unreadCount: number; latestMessageAt: string; recentMessages: typeof conversations[number]['messages'] } =>
        Boolean(c),
      )
      .sort((left, right) => new Date(right.latestMessageAt).getTime() - new Date(left.latestMessageAt).getTime());

    // Mark messages as read
    const messageIdsToMarkRead = filteredConversations.flatMap((conv) =>
      conv.recentMessages.filter((msg) => msg.unread === 1).map((msg) => msg.messageId),
    );

    if (messageIdsToMarkRead.length > 0) {
      await markMessagesRead(messageIdsToMarkRead);
    }

    return filteredConversations.slice(0, options.limit).map((conv) => ({
      conversationId: conv.conversationId,
      provider: conv.provider,
      providerConversationKey: conv.providerConversationKey,
      name: conv.name ?? undefined,
      contactSlug: conv.contactSlug ?? undefined,
      createdAt: conv.createdAt,
      updatedAt: conv.updatedAt,
      unreadCount: conv.unreadCount,
      latestMessageAt: conv.latestMessageAt,
      messages: conv.recentMessages.map((msg) => ({
        messageId: msg.messageId,
        conversationId: msg.conversationId,
        provider: msg.provider,
        providerMessageId: msg.providerMessageId ?? undefined,
        authorExternalId: msg.authorExternalId ?? undefined,
        authorDisplayName: msg.authorDisplayName ?? undefined,
        authorUsername: msg.authorUsername ?? undefined,
        content: msg.content,
        attachments: JSON.parse(msg.attachmentsJson),
        unread: msg.unread === 1,
        createdAt: msg.createdAt,
        metadata: msg.metadataJson ? JSON.parse(msg.metadataJson) : undefined,
      })),
    }));
  }

  async function getMessages(conversationId: string, limit: number) {
    const messages = await db.query.communicationMessages.findMany({
      where: eq(schema.communicationMessages.conversationId, conversationId),
      orderBy: (table) => schema.communicationMessages.createdAt,
    });

    const recentMessages = messages.slice(-limit);

    await markMessagesRead(recentMessages.filter((msg) => msg.unread === 1).map((msg) => msg.messageId));

    return recentMessages.map((msg) => ({
      messageId: msg.messageId,
      conversationId: msg.conversationId,
      provider: msg.provider,
      providerMessageId: msg.providerMessageId ?? undefined,
      authorExternalId: msg.authorExternalId ?? undefined,
      authorDisplayName: msg.authorDisplayName ?? undefined,
      authorUsername: msg.authorUsername ?? undefined,
      content: msg.content,
      attachments: JSON.parse(msg.attachmentsJson),
      unread: msg.unread === 1,
      createdAt: msg.createdAt,
      metadata: msg.metadataJson ? JSON.parse(msg.metadataJson) : undefined,
    }));
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
