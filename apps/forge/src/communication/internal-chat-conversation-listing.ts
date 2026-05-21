/**
 * internal-chat-conversation-listing.ts
 *
 * Lists conversations for an agent or external account, with recent message
 * previews and participant names. Extracted from communication/internal-chat-listing.ts
 * (issue #2278, phase 1).
 *
 * Contains:
 * - listConversations(agentId, unread?, limit): conversations for an agent
 * - listConversationsByAccount(accountId, limit): conversations for an external account
 */

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import { buildConversationParticipantNames } from './internal-chat-helpers';
import type { Database } from '../database/client';

// ─── Shared types ─────────────────────────────────────────────────────────────

type MessageRowBase = {
  messageId: string;
  unread: number;
  replyToMessageId: string | null;
  authorAccountId: string;
  authorDisplayName: string;
  content: string;
  createdAt: number;
};

type MessageRowFull = MessageRowBase & { conversationId: string };

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

export interface ConversationListingOutput {
  targetKey: string;
  provider: string;
  latestMessageAt: string;
  unreadCount: number;
  name: string;
  participants: string[];
  messages: MessageListItem[];
}

export interface InternalChatConversationListingDeps {
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
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createInternalChatConversationListing(
  db: Database,
  deps: InternalChatConversationListingDeps,
): { listConversations: (input: { agentId: string; unread?: boolean; limit: number }) => Promise<ConversationListingOutput[]>; listConversationsByAccount: (input: { accountId: string; limit: number }) => Promise<ConversationListingOutput[]> } {

  // ── listConversations ───────────────────────────────────────────────────────

  async function listConversations(input: {
    agentId: string;
    unread?: boolean;
    limit: number;
  }): Promise<ConversationListingOutput[]> {
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
      const shouldInclude = input.unread !== null && input.unread !== undefined ? row.unread === 1 : true;
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

    const memberRows = await db.query.internalChatConversationMembers.findMany({
      where: inArray(internalChatConversationMembers.conversationId, conversationIds),
      with: { account: true },
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
  }

  // ── listConversationsByAccount ──────────────────────────────────────────────

  async function listConversationsByAccount(input: {
    accountId: string;
    limit: number;
  }): Promise<ConversationListingOutput[]> {
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
        });
      }
      messagesByConversationId.set(row.conversationId, existing);
    }

    const memberRows = await db.query.internalChatConversationMembers.findMany({
      where: inArray(internalChatConversationMembers.conversationId, conversationIds),
      with: { account: true },
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
  }

  return { listConversations, listConversationsByAccount };
}