/**
 * Internal Chat Service — Message Operations
 *
 * Extracted from internal-chat-service.ts (#1555 split).
 * Contains all message retrieval, sending, attachment, and archive operations.
 */
import { and, desc, eq, gte, inArray, isNull, like, lte, sql } from 'drizzle-orm';
import { createId } from 'nanoid';

import type { CommunicationFile, CommunicationProviderMessage } from '@forge-runtime/core';
import type { Database } from '../database/index';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageAttachments,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import {
  AttachmentNotFoundError,
  ConversationNotFoundError,
  MessageNotFoundError,
} from './internal-chat-errors';
import { parseFilterDate } from './internal-chat-helpers';
import type { InternalChatDeliveryMessage } from './internal-chat-connection';
import type { ServiceHelpers } from './internal-chat-service-helpers';

export interface MessageServiceDeps {
  db: Database;
  createId: () => string;
  helpers: ServiceHelpers;
  /** Account lookup (for sendMessage: resolve targetKey to account) */
  getAccountByAgentId: (agentId: string) => Promise<{ id: string; agentId: string | null; slug: string; displayName: string } | null>;
  getAccountBySlug: (slug: string) => Promise<{ id: string; agentId: string | null; slug: string; displayName: string } | null>;
  /** Attachment storage */
  storeMessageAttachments: (messageId: string, attachments: CommunicationFile[]) => Promise<void>;
  readMessageAttachments: (messageId: string) => Promise<CommunicationFile[]>;
  readMessageAttachment: (messageId: string, name: string) => Promise<CommunicationFile | null>;
  /** Participant listing (for sendMessage live delivery) */
  listGroupMembersOrDmPeersByAccount: (accountId: string, conversationId: string) => Promise<Array<{ accountId: string; displayName: string }>>;
  /** Live message delivery via connection */
  connection: {
    deliverToParticipants: (opts: {
      excludeAccountId: string;
      participants: Array<{ accountId: string; displayName: string }>;
      conversation: { id: string; name: string | null; type: string };
      messageId: string;
      author: { id: string; displayName: string; slug: string };
      content: string;
      attachments: CommunicationFile[];
      createdAt: string;
    }) => Promise<string[]>;
  };
  /** Direct conversation creation (for sendMessage when targeting an account) */
  ensureDirectConversation: (leftAccountId: string, rightAccountId: string) => Promise<{ id: string; type: string; name: string | null } | null>;
}

export interface ConversationListingInput {
  agentId: string;
  limit: number;
  unread?: boolean;
}

export interface ConversationMessageInput {
  agentId: string;
  conversationKey: string;
  limit: number;
  offset: number;
  query?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AccountMessageInput {
  accountId: string;
  conversationKey: string;
  limit: number;
  offset: number;
  query?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface SendMessageInput {
  accountId: string;
  targetKey: string;
  content: string;
  attachments: CommunicationFile[];
}

export interface MessageAttachmentInput {
  accountId: string;
  conversationId: string;
  messageId: string;
  attachmentName: string;
}

export interface ArchiveConversationInput {
  accountId: string;
  conversationId: string;
}

export function createMessageService(deps: MessageServiceDeps) {
  const { db, helpers, connection } = deps;

  async function listConversationsByAgent(input: ConversationListingInput) {
    const agentAccount = await helpers.getRequiredAgentAccount(input.agentId);
    const conversationRows = await db
      .select({
        id: internalChatConversations.id,
        name: internalChatConversations.name,
        type: internalChatConversations.type,
        updatedAt: internalChatConversations.updatedAt,
      })
      .from(internalChatConversations)
      .innerJoin(
        internalChatConversationMembers,
        eq(internalChatConversationMembers.conversationId, internalChatConversations.id),
      )
      .where(eq(internalChatConversationMembers.accountId, agentAccount.id))
      .orderBy(desc(internalChatConversations.updatedAt))
      .limit(input.limit).all();

    const conversationIds = conversationRows.map((row) => row.id);
    if (conversationIds.length === 0) {
      return [];
    }

    const messageRows = await db
      .select({
        conversationId: internalChatMessages.conversationId,
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: internalChatAccounts.displayName,
        unread: sql<number>`case when ${internalChatMessageReads.readAt} is null then 1 else 0 end`,
      })
      .from(internalChatMessages)
      .innerJoin(
        internalChatMessageReads,
        and(
          eq(internalChatMessageReads.messageId, internalChatMessages.id),
          eq(internalChatMessageReads.agentId, input.agentId),
        ),
      )
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.id, internalChatMessages.authorAccountId),
      )
      .where(inArray(internalChatMessages.conversationId, conversationIds))
      .orderBy(desc(internalChatMessages.createdAt));

    const messageIdsToMarkRead = new Set<string>();
    const messagesByConversationId = new Map<string, CommunicationProviderMessage[]>();
    const unreadCountByConversationId = new Map<string, number>();

    for (const row of messageRows) {
      unreadCountByConversationId.set(
        row.conversationId,
        (unreadCountByConversationId.get(row.conversationId) ?? 0) + (row.unread ? 1 : 0),
      );
      const existing = messagesByConversationId.get(row.conversationId) ?? [];
      if ((input.unread ? row.unread === 1 : true) && existing.length < 5) {
        existing.push({
          messageId: row.messageId,
          provider: 'internal-chat',
          authorId: row.authorAccountId,
          targetKey: row.conversationId,
          content: row.content,
          attachments: await deps.readMessageAttachments(row.messageId),
          unread: row.unread === 1,
          createdAt: new Date(row.createdAt).toISOString(),
          authorDisplayName: row.authorDisplayName,
        });
        if (row.unread === 1) messageIdsToMarkRead.add(row.messageId);
      }
      messagesByConversationId.set(row.conversationId, existing);
    }

    if (messageIdsToMarkRead.size > 0) {
      const now = Date.now();
      await db
        .update(internalChatMessageReads)
        .set({ readAt: now })
        .where(and(
          eq(internalChatMessageReads.agentId, input.agentId),
          inArray(internalChatMessageReads.messageId, Array.from(messageIdsToMarkRead)),
        ));
    }

    const views = await Promise.all(
      conversationRows.map(async (conversation) => {
        const participants = await helpers.listGroupMembersOrDmPeers(input.agentId, conversation.id);
        const conversationName = conversation.name
          ?? (participants.find((p) => p.accountId !== agentAccount.id)?.displayName ?? participants[0]?.displayName);
        return {
          targetKey: conversation.id,
          provider: 'internal-chat',
          latestMessageAt: new Date(conversation.updatedAt).toISOString(),
          unreadCount: unreadCountByConversationId.get(conversation.id) ?? 0,
          name: conversationName,
          participants: participants.map((p) => p.displayName),
          messages: [...(messagesByConversationId.get(conversation.id) ?? [])].reverse(),
        };
      }),
    );

    return input.unread ? views.filter((v) => v.unreadCount > 0) : views;
  }

  async function getMessages(input: ConversationMessageInput): Promise<CommunicationProviderMessage[]> {
    await helpers.requireConversationMembership(input.agentId, input.conversationKey);
    const dateFrom = parseFilterDate(input.dateFrom, 'dateFrom');
    const dateTo = parseFilterDate(input.dateTo, 'dateTo');
    const filters = [
      eq(internalChatMessages.conversationId, input.conversationKey),
      ...(input.query ? [like(internalChatMessages.content, `%${input.query}%`)] : []),
      ...(dateFrom !== null ? [gte(internalChatMessages.createdAt, dateFrom)] : []),
      ...(dateTo !== null ? [lte(internalChatMessages.createdAt, dateTo)] : []),
    ];
    const rows = await db
      .select({
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: internalChatAccounts.displayName,
        unread: sql<number>`case when ${internalChatMessageReads.readAt} is null then 1 else 0 end`,
      })
      .from(internalChatMessages)
      .innerJoin(
        internalChatMessageReads,
        and(
          eq(internalChatMessageReads.messageId, internalChatMessages.id),
          eq(internalChatMessageReads.agentId, input.agentId),
        ),
      )
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.id, internalChatMessages.authorAccountId),
      )
      .where(and(...filters))
      .orderBy(desc(internalChatMessages.createdAt))
      .offset(input.offset)
      .limit(input.limit).all();

    const unreadMessageIds = rows.filter((row) => row.unread === 1).map((row) => row.messageId);
    if (unreadMessageIds.length > 0) {
      await db
        .update(internalChatMessageReads)
        .set({ readAt: Date.now() })
        .where(and(
          eq(internalChatMessageReads.agentId, input.agentId),
          inArray(internalChatMessageReads.messageId, unreadMessageIds),
        ));
    }

    return Promise.all(
      rows.reverse().map(async (row) => ({
        messageId: row.messageId,
        provider: 'internal-chat',
        authorId: row.authorAccountId,
        targetKey: input.conversationKey,
        content: row.content,
        attachments: await deps.readMessageAttachments(row.messageId),
        unread: row.unread === 1,
        createdAt: new Date(row.createdAt).toISOString(),
        authorDisplayName: row.authorDisplayName,
      })),
    );
  }

  async function getMessagesByAccount(input: AccountMessageInput): Promise<CommunicationProviderMessage[]> {
    await helpers.requireConversationMembershipByAccount(input.accountId, input.conversationKey);
    const dateFrom = parseFilterDate(input.dateFrom, 'dateFrom');
    const dateTo = parseFilterDate(input.dateTo, 'dateTo');
    const filters = [
      eq(internalChatMessages.conversationId, input.conversationKey),
      ...(input.query ? [like(internalChatMessages.content, `%${input.query}%`)] : []),
      ...(dateFrom !== null ? [gte(internalChatMessages.createdAt, dateFrom)] : []),
      ...(dateTo !== null ? [lte(internalChatMessages.createdAt, dateTo)] : []),
    ];
    const rows = await db
      .select({
        messageId: internalChatMessages.id,
        content: internalChatMessages.content,
        createdAt: internalChatMessages.createdAt,
        authorAccountId: internalChatMessages.authorAccountId,
        authorDisplayName: internalChatAccounts.displayName,
      })
      .from(internalChatMessages)
      .innerJoin(
        internalChatAccounts,
        eq(internalChatAccounts.id, internalChatMessages.authorAccountId),
      )
      .where(and(...filters))
      .orderBy(desc(internalChatMessages.createdAt))
      .offset(input.offset)
      .limit(input.limit).all();

    return Promise.all(
      rows.reverse().map(async (row) => ({
        messageId: row.messageId,
        provider: 'internal-chat',
        authorId: row.authorAccountId,
        targetKey: input.conversationKey,
        content: row.content,
        attachments: await deps.readMessageAttachments(row.messageId),
        unread: false,
        createdAt: new Date(row.createdAt).toISOString(),
        authorDisplayName: row.authorDisplayName,
      })),
    );
  }

  async function sendMessage(input: SendMessageInput) {
    const directAccount = await deps.getAccountByAgentId(input.targetKey) ?? await deps.getAccountBySlug(input.targetKey);
    const conversation = directAccount
      ? await deps.ensureDirectConversation(input.accountId, directAccount.id)
      : await helpers.getRequiredConversationForAccount(input.accountId, input.targetKey);

    if (!conversation) {
      throw new ConversationNotFoundError(input.targetKey);
    }

    const now = Date.now();
    const messageId = createId();
    const members = await db.query.internalChatConversationMembers.findMany({
      where: eq(internalChatConversationMembers.conversationId, conversation.id),
    });

    await db.insert(internalChatMessages).values({
      id: messageId,
      conversationId: conversation.id,
      authorAccountId: input.accountId,
      content: input.content,
      replyToMessageId: null,
      createdAt: now,
    });
    await deps.storeMessageAttachments(messageId, input.attachments);

    const memberAccounts = await Promise.all(
      members.map((m) => helpers.getRequiredAccount(m.accountId)),
    );
    const readRows = memberAccounts
      .filter((a) => a.agentId)
      .map((a) => ({
        messageId,
        agentId: a.agentId as string,
        readAt: a.id === input.accountId ? now : null,
      }));

    if (readRows.length > 0) {
      await db.insert(internalChatMessageReads).values(readRows);
    }

    await db
      .update(internalChatConversations)
      .set({ updatedAt: now })
      .where(eq(internalChatConversations.id, conversation.id));

    const author = await helpers.getRequiredAccount(input.accountId);
    const participants = await deps.listGroupMembersOrDmPeersByAccount(input.accountId, conversation.id);

    const liveDeliveredAgentIds = connection.deliverToParticipants({
      excludeAccountId: input.accountId,
      participants,
      conversation: { id: conversation.id, name: conversation.name, type: conversation.type },
      messageId,
      author: { id: author.id, displayName: author.displayName, slug: author.slug },
      content: input.content,
      attachments: input.attachments,
      createdAt: new Date(now).toISOString(),
    });

    if (liveDeliveredAgentIds.length > 0) {
      await db
        .update(internalChatMessageReads)
        .set({ readAt: now })
        .where(and(
          eq(internalChatMessageReads.messageId, messageId),
          inArray(internalChatMessageReads.agentId, liveDeliveredAgentIds),
          isNull(internalChatMessageReads.readAt),
        ));
    }

    return { success: true, messageId, conversationKey: conversation.id };
  }

  async function getMessageAttachmentByAccount(input: MessageAttachmentInput) {
    await helpers.getRequiredConversationForAccount(input.accountId, input.conversationId);
    const message = await db.query.internalChatMessages.findFirst({
      where: and(
        eq(internalChatMessages.id, input.messageId),
        eq(internalChatMessages.conversationId, input.conversationId),
      ),
    });
    if (!message) throw new MessageNotFoundError(input.messageId);
    const attachment = await deps.readMessageAttachment(input.messageId, input.attachmentName);
    if (!attachment) throw new AttachmentNotFoundError(input.attachmentName);
    return attachment;
  }

  async function archiveConversationByAccount(input: ArchiveConversationInput) {
    await helpers.getRequiredConversationForAccount(input.accountId, input.conversationId);
    await db
      .delete(internalChatConversationMembers)
      .where(and(
        eq(internalChatConversationMembers.conversationId, input.conversationId),
        eq(internalChatConversationMembers.accountId, input.accountId),
      ));
    const remaining = await db.query.internalChatConversationMembers.findMany({
      where: eq(internalChatConversationMembers.conversationId, input.conversationId),
      limit: 1,
    });
    if (remaining.length === 0) {
      await db.delete(internalChatConversations).where(eq(internalChatConversations.id, input.conversationId));
    }
    return { conversationId: input.conversationId, archived: true };
  }

  return {
    listConversationsByAgent,
    getMessages,
    getMessagesByAccount,
    sendMessage,
    getMessageAttachmentByAccount,
    archiveConversationByAccount,
  };
}
