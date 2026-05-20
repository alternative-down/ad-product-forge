import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatMessageAttachments,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import type { Database } from '../database/client';
import {
  type ConversationListingDeps,
  type MessageListItem,
  type MessageRowBase,
} from './internal-chat-listing-types';
import { forgeDebug as _forgeDebug } from '@forge-runtime/core';

export function createMessageListing(db: Database, deps: ConversationListingDeps) {

  async function getMessages(input: {
    agentId: string;
    conversationKey: string;
    limit: number;
    offset: number;
    dateFrom?: string;
    dateTo?: string;
    query?: string;
  }): Promise<Array<{
    messageId: string; provider: string; authorId: string; targetKey: string;
    content: string; attachments: unknown[]; unread: boolean; createdAt: string; authorDisplayName: string;
    replyToMessageId: string | null;
  }>> {
      const agentAccount = await deps.getRequiredAgentAccount(input.agentId);
      const membership = await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.accountId, agentAccount.id),
          eq(internalChatConversationMembers.conversationId, input.conversationKey),
        ),
      });
      if (!membership) {
        throw new Error('Conversation not found: ' + input.conversationKey);
      }
      const conditions = [eq(internalChatMessageReads.messageId, internalChatMessages.id)];
      if (input.dateFrom != null && input.dateFrom !== '') {
        const ts = new Date(input.dateFrom).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} >= ${ts}`);
      }
      if (input.dateTo != null && input.dateTo !== '') {
        const ts = new Date(input.dateTo).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} <= ${ts}`);
      }
      if (input.query != null && input.query !== '') {
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
        .where(and(
          eq(internalChatMessages.conversationId, input.conversationKey),
          ...conditions,
        ))
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

      const result = [];
      for (const row of messageRows as MessageRowBase[]) {
        const message: MessageListItem = {
          messageId: row.messageId,
          provider: 'internal-chat',
          authorId: row.authorAccountId,
          targetKey: input.conversationKey,
          content: row.content ?? '',
          attachments: attachmentsByMessageId.get(row.messageId) ?? [],
          unread: row.unread === 1,
          createdAt: new Date(row.createdAt ?? 0).toISOString(),
          authorDisplayName: row.authorDisplayName ?? '',
          replyToMessageId: row.replyToMessageId ?? null,
        };
        result.push(message);
        if (row.unread === 1) messageIdsToMarkRead.add(row.messageId);
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

      return result;
  }

  async function getMessagesByAccount(input: {
    accountId: string;
    conversationKey: string;
    limit: number;
    offset: number;
    dateFrom?: string;
    dateTo?: string;
    query?: string;
  }): Promise<Array<{
    messageId: string; provider: string; authorId: string; targetKey: string;
    content: string; attachments: unknown[]; unread: boolean; createdAt: string; authorDisplayName: string;
    replyToMessageId: string | null;
  }>> {
      await deps.getRequiredExternalAccount(input.accountId);
      const membership = await db.query.internalChatConversationMembers.findFirst({
        where: and(
          eq(internalChatConversationMembers.accountId, input.accountId),
          eq(internalChatConversationMembers.conversationId, input.conversationKey),
        ),
      });
      if (!membership) {
        throw new Error('Conversation not found: ' + input.conversationKey);
      }
      const conditions = [];
      if (input.dateFrom != null && input.dateFrom !== '') {
        const ts = new Date(input.dateFrom).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} >= ${ts}`);
      }
      if (input.dateTo != null && input.dateTo !== '') {
        const ts = new Date(input.dateTo).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} <= ${ts}`);
      }
      if (input.query != null && input.query !== '') {
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
        .where(and(
          eq(internalChatMessages.conversationId, input.conversationKey),
          ...conditions,
        ))
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

      const result = [];
      for (const row of messageRows as MessageRowBase[]) {
        result.push({
          messageId: row.messageId,
          provider: 'internal-chat',
          authorId: row.authorAccountId,
          targetKey: input.conversationKey,
          content: row.content ?? '',
          attachments: attachmentsByMessageId.get(row.messageId) ?? [],
          unread: false,
          createdAt: new Date(row.createdAt ?? 0).toISOString(),
          authorDisplayName: row.authorDisplayName ?? '',
          replyToMessageId: row.replyToMessageId ?? null,
        });
      }

      return result;
  }

  return {
    getMessages,
    getMessagesByAccount,
  };
}
