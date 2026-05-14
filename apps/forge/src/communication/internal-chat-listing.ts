import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageAttachments,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import type {Database} from '../database/client'
import { buildConversationParticipantNames } from './internal-chat-helpers';
import { forgeDebug } from '@forge-runtime/core';

async function withChatListingError<T>(operation: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    forgeDebug({ scope: 'internal-chat-listing', level: 'error', message: `[internal-chat-listing] ${operation} failed`, context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}

// =============================================================================
// ======================================================================
// Named types to avoid complex inline generics exceeding TS parser limits
type MessageRowBase = {
  messageId: string; unread: number; replyToMessageId: string | null;
  authorAccountId: string; authorDisplayName: string; content: string; createdAt: number;
};
type MessageRowFull = MessageRowBase & { conversationId: string };

interface MessageListItem {
  messageId: string; provider: string; authorId: string; targetKey: string;
  content: string; attachments: unknown[]; unread: boolean; createdAt: string;
  authorDisplayName: string; replyToMessageId: string | null;
}
interface MessageListItemWithConversation extends MessageListItem {
  conversationId: string;
}

export interface ConversationListingDeps {
  getRequiredAgentAccount(agentId: string): Promise<{
    id: string;
    agentId: string | null;
    slug: string;
    displayName: string;
  }>;
  getRequiredExternalAccount(accountId: string): Promise<{
    id: string;
    agentId: string | null;
    slug: string;
    displayName: string;
  }>;
  listGroupMembersOrDmPeers(agentId: string, conversationId: string): Promise<Array<{
    accountId: string;
    displayName: string;
    role: string;
    agentId: string | null;
    slug: string;
  }>>;
  listGroupMembersOrDmPeersByAccount(accountId: string, conversationId: string): Promise<Array<{
    accountId: string;
    displayName: string;
    role: string;
    agentId: string | null;
    slug: string;
  }>>;
}

export function createInternalChatListing(db: Database, deps: ConversationListingDeps) {

  async function listConversations(input: {
    agentId: string;
    unread?: boolean;
    limit: number;
  }): Promise<Array<{
    targetKey: string;
    provider: string;
    latestMessageAt: string;
    unreadCount: number;
    name: string;
    participants: string[];
    messages: Array<{
      messageId: string; provider: string; authorId: string; targetKey: string;
      content: string; attachments: unknown[]; unread: boolean; createdAt: string; authorDisplayName: string;
      replyToMessageId: string | null;
    }>;
  }>> {
    return await withChatListingError('listConversations', async () => {
      const agentAccount = await deps.getRequiredAgentAccount(input.agentId);
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
      if (conversationIds.length === 0) return [];
      const messageRows = await db
        .select({
          conversationId: internalChatMessages.conversationId,
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
        .innerJoin(internalChatAccounts, eq(internalChatAccounts.id, internalChatMessages.authorAccountId))
        .where(inArray(internalChatMessages.conversationId, conversationIds))
        .orderBy(desc(internalChatMessages.createdAt)).all();
      const messageIdsToMarkRead = new Set<string>();
      const messagesByConversationId = new Map<string, unknown[]>();
      const unreadCountByConversationId = new Map<string, number>();
      for (const row of messageRows as MessageRowFull[]) {
        unreadCountByConversationId.set(
          row.conversationId,
          (unreadCountByConversationId.get(row.conversationId) ?? 0) + (row.unread === 1 ? 1 : 0),
        );
        const existing = messagesByConversationId.get(row.conversationId) ?? [];
        const shouldInclude = input.unread ? row.unread === 1 : true;
        if (shouldInclude && existing.length < 5) {
          existing.push({
            messageId: row.messageId,
            provider: 'internal-chat',
            authorId: row.authorAccountId,
            targetKey: row.conversationId,
            content: row.content ?? '',
            attachments: [],
            unread: row.unread === 1,
            createdAt: new Date(row.createdAt ?? 0).toISOString(),
            authorDisplayName: row.authorDisplayName ?? '',
            replyToMessageId: row.replyToMessageId ?? null,
          } as MessageListItem);
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

      // Batch-load all members for all conversations (was N+1 per conversation)
      const memberRows = await db.query.internalChatConversationMembers.findMany({
        where: inArray(internalChatConversationMembers.conversationId, conversationIds),
        with: {
          account: true,
        },
      });
      const membersByConversationId = new Map<string, Array<{
        accountId: string;
        displayName: string;
        role: string;
        agentId: string | null;
        slug: string;
      }>>();
      for (const row of memberRows as Array<{
          conversationId: string; accountId: string; role: string;
          createdAt: number; updatedAt: number;
          displayName: string; agentId: string | null; slug: string;
          account: { id: string; slug: string; description: string | null; displayName: string; createdAt: number; updatedAt: number; agentId: string | null; };
        }>) {
        const entry: { accountId: string; displayName: string; role: string; agentId: string | null; slug: string } = {
          accountId: row.accountId,
          displayName: row.displayName,
          role: row.role,
          agentId: row.agentId,
          slug: row.slug,
        };
        const existing = membersByConversationId.get(row.conversationId) ?? [];
        existing.push(entry);
        membersByConversationId.set(row.conversationId, existing);
      }

      return conversationRows.map((conversation) => {
        const participants: Array<{ accountId: string; displayName: string; role: string; agentId: string | null; slug: string }> = membersByConversationId.get(conversation.id) ?? [];
        const conversationName = conversation.name
          ?? (participants.find((p) => p.accountId !== agentAccount.id)?.displayName ?? participants[0]?.displayName);
        return {
          targetKey: conversation.id,
          provider: 'internal-chat',
          latestMessageAt: new Date(conversation.updatedAt).toISOString(),
          unreadCount: unreadCountByConversationId.get(conversation.id) ?? 0,
          name: conversationName ?? '',
          participants: buildConversationParticipantNames(participants),
          messages: [...(messagesByConversationId.get(conversation.id) as MessageListItem[] || [])].reverse(),
        };
      });
    });
  }

  async function listConversationsByAccount(input: {
    accountId: string;
    limit: number;
  }): Promise<Array<{
    targetKey: string;
    provider: string;
    latestMessageAt: string;
    unreadCount: number;
    name: string;
    participants: string[];
    messages: Array<{
      messageId: string; provider: string; authorId: string; targetKey: string;
      content: string; attachments: unknown[]; unread: boolean; createdAt: string; authorDisplayName: string;
      replyToMessageId: string | null;
    }>;
  }>> {
    return await withChatListingError('listConversationsByAccount', async () => {
      await deps.getRequiredExternalAccount(input.accountId);
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
        .where(eq(internalChatConversationMembers.accountId, input.accountId))
        .orderBy(desc(internalChatConversations.updatedAt))
        .limit(input.limit).all();

      const conversationIds = conversationRows.map((row) => row.id);
      if (conversationIds.length === 0) return [];

      const messageRows = await db
        .select({
          conversationId: internalChatMessages.conversationId,
          messageId: internalChatMessages.id,
          content: internalChatMessages.content,
          createdAt: internalChatMessages.createdAt,
          authorAccountId: internalChatMessages.authorAccountId,
          authorDisplayName: internalChatAccounts.displayName,
          replyToMessageId: internalChatMessages.replyToMessageId,
        })
        .from(internalChatMessages)
        .innerJoin(internalChatAccounts, eq(internalChatAccounts.id, internalChatMessages.authorAccountId))
        .where(inArray(internalChatMessages.conversationId, conversationIds))
        .orderBy(desc(internalChatMessages.createdAt)).all();

      const messagesByConversationId = new Map<string, unknown[]>();
      for (const row of messageRows as MessageRowFull[]) {
        const existing = messagesByConversationId.get(row.conversationId) ?? [];
        if (existing.length < 5) {
          existing.push({
            messageId: row.messageId,
            provider: 'internal-chat',
            authorId: row.authorAccountId,
            targetKey: row.conversationId,
            content: row.content ?? '',
            attachments: [],
            unread: false,
            createdAt: new Date(row.createdAt ?? 0).toISOString(),
            authorDisplayName: row.authorDisplayName ?? '',
            replyToMessageId: row.replyToMessageId ?? null,
          } as MessageListItem);
        }
        messagesByConversationId.set(row.conversationId, existing);
      }

      // Batch-load all members for all conversations (was N+1 per conversation)
      const memberRows = await db.query.internalChatConversationMembers.findMany({
        where: inArray(internalChatConversationMembers.conversationId, conversationIds),
        with: {
          account: true,
        },
      });
      const membersByConversationId = new Map<string, Array<{
        accountId: string;
        displayName: string;
        role: string;
        agentId: string | null;
        slug: string;
      }>>();
      for (const row of memberRows as Array<{
          conversationId: string; accountId: string; role: string;
          createdAt: number; updatedAt: number;
          displayName: string; agentId: string | null; slug: string;
          account: { id: string; slug: string; description: string | null; displayName: string; createdAt: number; updatedAt: number; agentId: string | null; };
        }>) {
        const entry: { accountId: string; displayName: string; role: string; agentId: string | null; slug: string } = {
          accountId: row.accountId,
          displayName: row.displayName,
          role: row.role,
          agentId: row.agentId,
          slug: row.slug,
        };
        const existing = membersByConversationId.get(row.conversationId) ?? [];
        existing.push(entry);
        membersByConversationId.set(row.conversationId, existing);
      }

      return conversationRows.map((conversation) => {
        const participants: Array<{ accountId: string; displayName: string; role: string; agentId: string | null; slug: string }> = membersByConversationId.get(conversation.id) ?? [];
        const conversationName = conversation.name
          ?? (participants.find((p) => p.accountId !== input.accountId)?.displayName ?? participants[0]?.displayName);
        return {
          targetKey: conversation.id,
          provider: 'internal-chat',
          latestMessageAt: new Date(conversation.updatedAt).toISOString(),
          unreadCount: 0,
          name: conversationName ?? '',
          participants: buildConversationParticipantNames(participants),
          messages: [...(messagesByConversationId.get(conversation.id) as MessageListItem[] || [])].reverse(),
        };
      });
    });
  }

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
    return await withChatListingError('getMessages', async () => {
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
      if (input.dateFrom) {
        const ts = new Date(input.dateFrom).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} >= ${ts}`);
      }
      if (input.dateTo) {
        const ts = new Date(input.dateTo).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} <= ${ts}`);
      }
      if (input.query) {
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
  }): Promise<Array<{
    messageId: string; provider: string; authorId: string; targetKey: string;
    content: string; attachments: unknown[]; unread: boolean; createdAt: string; authorDisplayName: string;
    replyToMessageId: string | null;
  }>> {
    return await withChatListingError('getMessagesByAccount', async () => {
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
      if (input.dateFrom) {
        const ts = new Date(input.dateFrom).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} >= ${ts}`);
      }
      if (input.dateTo) {
        const ts = new Date(input.dateTo).getTime();
        if (!isNaN(ts)) conditions.push(sql`${internalChatMessages.createdAt} <= ${ts}`);
      }
      if (input.query) {
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

      const result: MessageListItem[] = [];
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
    });
  }

  return {
    listConversations,
    listConversationsByAccount,
    getMessages,
    getMessagesByAccount,
  };
}