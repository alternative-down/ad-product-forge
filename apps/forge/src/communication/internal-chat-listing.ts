import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import type {Database} from '../database/client'
import { buildConversationParticipantNames } from './internal-chat-helpers';
import { forgeDebug } from '@forge-runtime/core';

// =============================================================================
// Conversation listing
// =============================================================================

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
  readMessageAttachments(messageId: string): Promise<unknown[]>;
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
    try {
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
      const messagesByConversationId = new Map<string, Array<unknown>>();
      const unreadCountByConversationId = new Map<string, number>();
      for (const row of messageRows as Array<{ conversationId: string; messageId: string; unread: number; replyToMessageId: string | null }>) {
        unreadCountByConversationId.set(
          row.conversationId,
          (unreadCountByConversationId.get(row.conversationId) ?? 0) + (row.unread === 1 ? 1 : 0),
        );
        const existing = messagesByConversationId.get(row.conversationId) ?? [];
        const shouldInclude = input.unread ? row.unread === 1 : true;
        if (shouldInclude && existing.length < 5) {
          existing.push({
            messageId: (row as { messageId: string }).messageId,
            provider: 'internal-chat',
            authorId: (row as { authorAccountId?: string }).authorAccountId ?? '',
            targetKey: row.conversationId,
            content: (row as { content?: string }).content ?? '',
            attachments: [],
            unread: row.unread === 1,
            createdAt: new Date((row as { createdAt?: number }).createdAt ?? 0).toISOString(),
            authorDisplayName: (row as { authorDisplayName?: string }).authorDisplayName ?? '',
            replyToMessageId: (row as { replyToMessageId?: string | null }).replyToMessageId ?? null,
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

      return Promise.all(
        conversationRows.map(async (conversation) => {
          const participants = await deps.listGroupMembersOrDmPeers(input.agentId, conversation.id);
          const conversationName = conversation.name
            ?? (participants.find((p) => p.accountId !== agentAccount.id)?.displayName ?? participants[0]?.displayName);
          return {
            targetKey: conversation.id,
            provider: 'internal-chat',
            latestMessageAt: new Date(conversation.updatedAt).toISOString(),
            unreadCount: unreadCountByConversationId.get(conversation.id) ?? 0,
            name: conversationName ?? '',
            participants: buildConversationParticipantNames(participants),
            messages: [...(messagesByConversationId.get(conversation.id) ?? [])].reverse(),
          };
        }),
      );
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-listing', level: 'error', message: '[internal-chat-listing] listConversations failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
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
    try {
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

      const messagesByConversationId = new Map<string, Array<unknown>>();
      for (const row of messageRows as Array<{ conversationId: string; messageId: string; replyToMessageId: string | null }>) {
        const existing = messagesByConversationId.get(row.conversationId) ?? [];
        if (existing.length < 5) {
          existing.push({
            messageId: (row as { messageId: string }).messageId,
            provider: 'internal-chat',
            authorId: (row as { authorAccountId?: string }).authorAccountId ?? '',
            targetKey: row.conversationId,
            content: (row as { content?: string }).content ?? '',
            attachments: [],
            unread: false,
            createdAt: new Date((row as { createdAt?: number }).createdAt ?? 0).toISOString(),
            authorDisplayName: (row as { authorDisplayName?: string }).authorDisplayName ?? '',
            replyToMessageId: (row as { replyToMessageId?: string | null }).replyToMessageId ?? null,
          });
        }
        messagesByConversationId.set(row.conversationId, existing);
      }

      return Promise.all(
        conversationRows.map(async (conversation) => {
          const participants = await deps.listGroupMembersOrDmPeersByAccount(input.accountId, conversation.id);
          const conversationName = conversation.name
            ?? (participants.find((p) => p.accountId !== input.accountId)?.displayName ?? participants[0]?.displayName);
          return {
            targetKey: conversation.id,
            provider: 'internal-chat',
            latestMessageAt: new Date(conversation.updatedAt).toISOString(),
            unreadCount: 0,
            name: conversationName ?? '',
            participants: buildConversationParticipantNames(participants),
            messages: [...(messagesByConversationId.get(conversation.id) ?? [])].reverse(),
          };
        }),
      );
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-listing', level: 'error', message: '[internal-chat-listing] listConversationsByAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
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
    try {
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

      const result = [];
      for (const row of messageRows as Array<{ messageId: string; unread: number; replyToMessageId: string | null }>) {
        const message: Record<string, unknown> = {
          messageId: row.messageId,
          provider: 'internal-chat',
          authorId: (row as { authorAccountId?: string }).authorAccountId ?? '',
          targetKey: input.conversationKey,
          content: (row as { content?: string }).content ?? '',
          attachments: await deps.readMessageAttachments(row.messageId),
          unread: row.unread === 1,
          createdAt: new Date((row as { createdAt?: number }).createdAt ?? 0).toISOString(),
          authorDisplayName: (row as { authorDisplayName?: string }).authorDisplayName ?? '',
          replyToMessageId: (row as { replyToMessageId?: string | null }).replyToMessageId ?? null,
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
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-listing', level: 'error', message: '[internal-chat-listing] getMessages failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
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
    try {
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

      const result = [];
      for (const row of messageRows as Array<{ messageId: string; replyToMessageId: string | null }>) {
        result.push({
          messageId: (row as { messageId: string }).messageId,
          provider: 'internal-chat',
          authorId: (row as { authorAccountId?: string }).authorAccountId ?? '',
          targetKey: input.conversationKey,
          content: (row as { content?: string }).content ?? '',
          attachments: await deps.readMessageAttachments(row.messageId),
          unread: false,
          createdAt: new Date((row as { createdAt?: number }).createdAt ?? 0).toISOString(),
          authorDisplayName: (row as { authorDisplayName?: string }).authorDisplayName ?? '',
          replyToMessageId: (row as { replyToMessageId?: string | null }).replyToMessageId ?? null,
        });
      }

      return result;
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-listing', level: 'error', message: '[internal-chat-listing] getMessagesByAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  return {
    listConversations,
    listConversationsByAccount,
    getMessages,
    getMessagesByAccount,
  };
}