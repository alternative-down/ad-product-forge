import { and, desc, eq, inArray, like, lte, gte, sql } from 'drizzle-orm';
import { createId } from '../utils/id';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessages,
  internalChatMessageReads,
} from '../database/schema';
import type { Database } from '../database/index';
import { parseFilterDate } from './internal-chat-helpers';

// =============================================================================
// Message sending and retrieval
// =============================================================================

export interface MessageFilterInput {
  conversationKey: string;
  limit: number;
  offset: number;
  query?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface AccountMessageFilterInput extends MessageFilterInput {
  accountId: string;
  agentId?: string;
}

export interface SendMessageInput {
  targetKey: string;
  content: string;
  attachments?: Array<{ name: string; url: string; mimeType: string; size: number }>;
  authorAccountId: string;
}

export function createInternalChatMessages(db: Database) {

  /**
   * Sends a message to a conversation, attaching files and updating conversation timestamp.
   */
  async function sendMessage(input: SendMessageInput): Promise<{
    messageId: string;
    conversationId: string;
  }> {
    const now = Date.now();
    const messageId = createId();
    await db.insert(internalChatMessages).values({
      id: messageId,
      conversationId: input.targetKey,
      authorAccountId: input.authorAccountId,
      content: input.content,
      createdAt: now,
      updatedAt: now,
    });

    if (input.attachments && input.attachments.length > 0) {
      // Store attachments is called by the main service via the attachments module
    }

    await db
      .update(internalChatConversations)
      .set({ updatedAt: now })
      .where(eq(internalChatConversations.id, input.targetKey));

    return { messageId, conversationId: input.targetKey };
  }

  /**
   * Returns messages for an agent-conversation pair, with optional filters.
   * Marks unread messages as read.
   */
  async function getMessages(input: AccountMessageFilterInput & { agentId: string }): Promise<Array<{
    messageId: string;
    provider: string;
    authorId: string;
    targetKey: string;
    content: string;
    attachments: unknown[];
    unread: boolean;
    createdAt: string;
    authorDisplayName: string;
  }>> {
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
      .innerJoin(internalChatAccounts, eq(internalChatAccounts.id, internalChatMessages.authorAccountId))
      .where(and(...filters))
      .orderBy(desc(internalChatMessages.createdAt))
      .offset(input.offset)
      .limit(input.limit)
      .all();

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

    return rows.reverse().map((row) => ({
      messageId: row.messageId,
      provider: 'internal-chat',
      authorId: row.authorAccountId,
      targetKey: input.conversationKey,
      content: row.content,
      attachments: [],
      unread: row.unread === 1,
      createdAt: new Date(row.createdAt).toISOString(),
      authorDisplayName: row.authorDisplayName,
    }));
  }

  /**
   * Returns messages for an account-conversation pair, using accountId directly.
   */
  async function getMessagesByAccount(input: AccountMessageFilterInput): Promise<Array<{
    messageId: string;
    provider: string;
    authorId: string;
    targetKey: string;
    content: string;
    attachments: unknown[];
    unread: boolean;
    createdAt: string;
    authorDisplayName: string;
  }>> {
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
      .innerJoin(internalChatAccounts, eq(internalChatAccounts.id, internalChatMessages.authorAccountId))
      .where(and(...filters))
      .orderBy(desc(internalChatMessages.createdAt))
      .offset(input.offset)
      .limit(input.limit)
      .all();

    return rows.reverse().map((row) => ({
      messageId: row.messageId,
      provider: 'internal-chat',
      authorId: row.authorAccountId,
      targetKey: input.conversationKey,
      content: row.content,
      attachments: [],
      unread: false,
      createdAt: new Date(row.createdAt).toISOString(),
      authorDisplayName: row.authorDisplayName,
    }));
  }

  return { sendMessage, getMessages, getMessagesByAccount };
}