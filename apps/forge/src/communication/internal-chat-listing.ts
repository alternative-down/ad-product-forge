/**
 * Test dependency shape for internal chat listing modules.
 * Aliased from InternalChatConversationListingDeps for backward compatibility.
 */
import type { InternalChatConversationListingDeps } from './internal-chat-conversation-listing';
export type ConversationListingDeps = InternalChatConversationListingDeps;

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations as _internalChatConversations,
  internalChatMessageAttachments,
  internalChatMessageReads,
  internalChatMessages,
  type InternalChatConversationMember,
} from '../database/schema';
import type { Database } from '../database/client';
import { buildConversationParticipantNames as _buildConversationParticipantNames } from './internal-chat-helpers';
import { createInternalChatConversationListing } from './internal-chat-conversation-listing';
import { forgeDebug as _forgeDebug } from '@forge-runtime/core';

async function withChatListingError<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  return await fn();
}

// =============================================================================
// ======================================================================
// Named types to avoid complex inline generics exceeding TS parser limits
type MessageRowBase = {
  messageId: string;
  unread: number;
  replyToMessageId: string | null;
  authorAccountId: string;
  authorDisplayName: string;
  content: string;
  createdAt: number;
};

interface MessageListItem {
  messageId: string;
  provider: string;
  authorId: string;
  targetKey: string;
  content: string;
  attachments: unknown[];
  unread: boolean;
  createdAt: string;
  authorDisplayName: string;
  replyToMessageId: string | null;
}

export function createInternalChatListing(db: Database, deps: InternalChatConversationListingDeps) {
  async function getMessages(input: {
    agentId: string;
    conversationKey: string;
    limit: number;
    offset: number;
    dateFrom?: string;
    dateTo?: string;
    query?: string;
  }): Promise<
    Array<{
      messageId: string;
      provider: string;
      authorId: string;
      targetKey: string;
      content: string;
      attachments: unknown[];
      unread: boolean;
      createdAt: string;
      authorDisplayName: string;
      replyToMessageId: string | null;
    }>
  > {
    return await withChatListingError('getMessages', async () => {
      const agentAccount = await deps.getRequiredAgentAccount(input.agentId);
      const membership = (await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.accountId, agentAccount.id),
          eq(internalChatConversationMembers.conversationId, input.conversationKey),
        ),
      })) as InternalChatConversationMember | null;
      if (membership === null || membership === undefined) {
        throw new Error('Conversation not found: ' + input.conversationKey);
      }
      const conditions = [eq(internalChatMessageReads.messageId, internalChatMessages.id)];
      if (input.dateFrom !== null && input.dateFrom !== undefined) {
        const ts = new Date(input.dateFrom).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} >= ${ts}`);
      }
      if (input.dateTo !== null && input.dateTo !== undefined) {
        const ts = new Date(input.dateTo).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} <= ${ts}`);
      }
      if (input.query !== null && input.query !== undefined) {
        conditions.push(sql`${internalChatMessages.content} LIKE ${'%' + input.query + '%'}`);
      }

      const messageRows = await db
        .select({
          messageId: internalChatMessages.id,
          content: internalChatMessages.content,
          createdAt: internalChatMessages.createdAt,
          authorAccountId: internalChatMessages.authorAccountId,
          authorDisplayName: internalChatAccounts.displayName,
          replyToMessageId: internalChatMessages.replyToMessageId,
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
        .innerJoin(
          internalChatConversationMembers,
          and(
            eq(internalChatConversationMembers.conversationId, internalChatMessages.conversationId),
            eq(internalChatConversationMembers.accountId, agentAccount.id),
          ),
        )
        .where(and(eq(internalChatMessages.conversationId, input.conversationKey), ...conditions))
        .orderBy(desc(internalChatMessages.createdAt))
        .limit(input.limit)
        .offset(input.offset)
        .all();

      const messageIdsToMarkRead = new Set<string>();
      const messageIds = messageRows.map((row) => row.messageId);

      // Batch-fetch all attachments in a single query instead of N queries
      const attachmentsByMessageId = new Map<string, unknown[]>();
      if (messageIds.length > 0) {
        const attachmentRows = await db.query.internalChatMessageAttachments.findMany({
          where: inArray(internalChatMessageAttachments.messageId, messageIds),
          orderBy: (table, { asc }) => [asc(table.messageId), asc(table.attachmentIndex)],
        });
        for (const row of attachmentRows) {
          const existing = attachmentsByMessageId.get(row.messageId) ?? [];
          existing.push({
            name: row.name,
            data: new Uint8Array(row.data),
            contentType: row.contentType ?? null,
            sizeBytes: row.sizeBytes,
          });
          attachmentsByMessageId.set(row.messageId, existing);
        }
      }

      const result: MessageListItem[] = [];
      for (const row of messageRows) {
        result.push({
          messageId: row.messageId,
          provider: 'internal-chat',
          authorId: row.authorAccountId,
          targetKey: input.conversationKey,
          content: row.content,
          attachments: attachmentsByMessageId.get(row.messageId) ?? [],
          unread: row.unread === 1,
          createdAt: new Date(row.createdAt).toISOString(),
          authorDisplayName: row.authorDisplayName,
          replyToMessageId: row.replyToMessageId,
        });
        if (row.unread === 1) messageIdsToMarkRead.add(row.messageId);
      }

      if (messageIdsToMarkRead.size > 0) {
        const now = Date.now();
        await db
          .update(internalChatMessageReads)
          .set({ readAt: now })
          .where(
            and(
              eq(internalChatMessageReads.agentId, input.agentId),
              inArray(internalChatMessageReads.messageId, Array.from(messageIdsToMarkRead)),
            ),
          );
      }

      return result;
    });
  }

  async function getMessagesByAccount(input: {
    accountId: string;
    conversationKey: string;
    limit: number;
    offset: number;
    dateFrom?: string;
    dateTo?: string;
    query?: string;
  }): Promise<
    Array<{
      messageId: string;
      provider: string;
      authorId: string;
      targetKey: string;
      content: string;
      attachments: unknown[];
      unread: boolean;
      createdAt: string;
      authorDisplayName: string;
      replyToMessageId: string | null;
    }>
  > {
    return await withChatListingError('getMessagesByAccount', async () => {
      await deps.getRequiredExternalAccount(input.accountId);
      const membership = (await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.accountId, input.accountId),
          eq(internalChatConversationMembers.conversationId, input.conversationKey),
        ),
      })) as InternalChatConversationMember | null;
      if (membership === null || membership === undefined) {
        throw new Error('Conversation not found: ' + input.conversationKey);
      }
      const conditions = [];
      if (input.dateFrom !== null && input.dateFrom !== undefined) {
        const ts = new Date(input.dateFrom).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} >= ${ts}`);
      }
      if (input.dateTo !== null && input.dateTo !== undefined) {
        const ts = new Date(input.dateTo).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} <= ${ts}`);
      }
      if (input.query !== null && input.query !== undefined) {
        conditions.push(sql`${internalChatMessages.content} LIKE ${'%' + input.query + '%'}`);
      }

      const messageRows = await db
        .select({
          messageId: internalChatMessages.id,
          content: internalChatMessages.content,
          createdAt: internalChatMessages.createdAt,
          authorAccountId: internalChatMessages.authorAccountId,
          authorDisplayName: internalChatAccounts.displayName,
          replyToMessageId: internalChatMessages.replyToMessageId,
        })
        .from(internalChatMessages)
        .innerJoin(
          internalChatAccounts,
          eq(internalChatAccounts.id, internalChatMessages.authorAccountId),
        )
        .innerJoin(
          internalChatConversationMembers,
          and(
            eq(internalChatConversationMembers.conversationId, internalChatMessages.conversationId),
            eq(internalChatConversationMembers.accountId, input.accountId),
          ),
        )
        .where(and(eq(internalChatMessages.conversationId, input.conversationKey), ...conditions))
        .orderBy(desc(internalChatMessages.createdAt))
        .limit(input.limit)
        .offset(input.offset)
        .all();

      const messageIds = messageRows.map((row) => row.messageId);

      // Batch-fetch all attachments in a single query instead of N queries
      const attachmentsByMessageId = new Map<string, unknown[]>();
      if (messageIds.length > 0) {
        const attachmentRows = await db.query.internalChatMessageAttachments.findMany({
          where: inArray(internalChatMessageAttachments.messageId, messageIds),
          orderBy: (table, { asc }) => [asc(table.messageId), asc(table.attachmentIndex)],
        });
        for (const row of attachmentRows) {
          const existing = attachmentsByMessageId.get(row.messageId) ?? [];
          existing.push({
            name: row.name,
            data: new Uint8Array(row.data),
            contentType: row.contentType ?? null,
            sizeBytes: row.sizeBytes,
          });
          attachmentsByMessageId.set(row.messageId, existing);
        }
      }

      const result: MessageListItem[] = [];
      for (const row of messageRows) {
        result.push({
          messageId: row.messageId,
          provider: 'internal-chat',
          authorId: row.authorAccountId,
          targetKey: input.conversationKey,
          content: row.content,
          attachments: attachmentsByMessageId.get(row.messageId) ?? [],
          unread: false,
          createdAt: new Date(row.createdAt).toISOString(),
          authorDisplayName: row.authorDisplayName,
          replyToMessageId: row.replyToMessageId,
        });
      }

      return result;
    });
  }

  const conversationListing = createInternalChatConversationListing(db, {
    getRequiredAgentAccount: deps.getRequiredAgentAccount,
    getRequiredExternalAccount: deps.getRequiredExternalAccount,
  });

  return {
    listConversations: conversationListing.listConversations,
    listConversationsByAccount: conversationListing.listConversationsByAccount,
    getMessages,
    getMessagesByAccount,
  };
}
