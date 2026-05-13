import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  internalChatConversations,
  internalChatConversationMembers,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import type { Database } from '../database/client';
import {
  type ConversationListingDeps,
  type ConversationListItem,
  type MessageListItem,
  type MessageRowFull,
  type ConversationParticipant,
} from './internal-chat-listing-types';
import { forgeDebug } from '@forge-runtime/core';

export function createConversationListing(db: Database, deps: ConversationListingDeps) {

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
      const messagesByConversationId = new Map<string, MessageListItem[]>();
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
        const participants = membersByConversationId.get(conversation.id) ?? [];
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
      });
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

      const messagesByConversationId = new Map<string, MessageListItem[]>();
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
        const participants = membersByConversationId.get(conversation.id) ?? [];
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
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-listing', level: 'error', message: '[internal-chat-listing] listConversationsByAccount failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  return {
    listConversations,
    listConversationsByAccount,
  };
}
