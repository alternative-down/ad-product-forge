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
    }>;
  }>> {
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

    for (const row of messageRows as Array<{ conversationId: string; messageId: string; unread: number }>) {
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
    }>;
  }>> {
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
      })
      .from(internalChatMessages)
      .innerJoin(internalChatAccounts, eq(internalChatAccounts.id, internalChatMessages.authorAccountId))
      .where(inArray(internalChatMessages.conversationId, conversationIds))
      .orderBy(desc(internalChatMessages.createdAt)).all();

    const messagesByConversationId = new Map<string, Array<unknown>>();
    for (const row of messageRows as Array<{ conversationId: string; messageId: string }>) {
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
          participants: participants.map((p) => p.displayName),
          messages: [...(messagesByConversationId.get(conversation.id) ?? [])].reverse(),
        };
      }),
    );
  }

  return { listConversations, listConversationsByAccount };
}