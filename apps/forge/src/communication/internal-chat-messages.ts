import {
  and, desc, eq, gte, inArray, like, lte, sql,
} from 'drizzle-orm';

import { forgeDebug } from '@forge-runtime/core';
import type { CommunicationProviderMessage } from '@forge-runtime/core';

import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import { parseFilterDate } from './internal-chat-helpers';


import type {Database} from '../database/schema';

/**
 * Internal Chat — Messages Module
 *
 * Message retrieval and conversation archival.
 * Extracted from #1283 / #1714 refactor of internal-chat-service.ts.
 *
 * ## Dependencies
 *
 *   requireConversationMembership — guard: agent must be in conversation
 *   requireConversationMembershipByAccount — guard: account must be in conv
 *   getRequiredConversationForAccount — fetch conversation or throw
 *   readMessageAttachments — fetch attachments for a messageId
 *
 * @module
 */

/**
 * Dependencies required by createInternalChatMessages.
 * All are resolved in the parent createInternalChatService scope.
 */
export interface InternalChatMessagesDeps {
  requireConversationMembership(agentId: string, conversationId: string): Promise<void>;
  requireConversationMembershipByAccount(accountId: string, conversationId: string): Promise<void>;
  getRequiredConversationForAccount(
    accountId: string,
    conversationId: string,
  ): Promise<{ id: string; type: string; name: string | null }>;
  readMessageAttachments(messageId: string): Promise<unknown[]>;
}

export function createInternalChatMessages(
  db: Database,
  deps: InternalChatMessagesDeps,
) {
  const { requireConversationMembership, requireConversationMembershipByAccount,
    getRequiredConversationForAccount, readMessageAttachments } = deps;

  // === Message Retrieval ──────────────────────────────────────────────────
  async function getMessages(input: {
    agentId: string;
    conversationKey: string;
    limit: number;
    offset: number;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<CommunicationProviderMessage[]> {
    await requireConversationMembership(input.agentId, input.conversationKey);
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

    return await Promise.all(
      rows.reverse().map(async (row) => ({
        messageId: row.messageId,
        provider: 'internal-chat',
        authorId: row.authorAccountId,
        targetKey: input.conversationKey,
        content: row.content,
        attachments: await readMessageAttachments(row.messageId),
        unread: row.unread === 1,
        createdAt: new Date(row.createdAt).toISOString(),
        authorDisplayName: row.authorDisplayName,
      })),
    );
  }

  // ── ByAccount variant ─────────────────────────────────────────────────────
  // getMessagesByAccount: same as getMessages above, but uses accountId directly.
  // Used when the caller already has a concrete account reference.
  async function getMessagesByAccount(input: {
    accountId: string;
    conversationKey: string;
    limit: number;
    offset: number;
    query?: string;
    dateFrom?: string;
    dateTo?: string;
  }): Promise<CommunicationProviderMessage[]> {
    await requireConversationMembershipByAccount(input.accountId, input.conversationKey);
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

    return await Promise.all(
      rows.reverse().map(async (row) => ({
        messageId: row.messageId,
        provider: 'internal-chat',
        authorId: row.authorAccountId,
        targetKey: input.conversationKey,
        content: row.content,
        attachments: await readMessageAttachments(row.messageId),
        unread: false,
        createdAt: new Date(row.createdAt).toISOString(),
        authorDisplayName: row.authorDisplayName,
      })),
    );
  }

  // ── Account-scoped Message Retrieval ─────────────────────────────────────
  // === Archive Conversation ───────────────────────────────────────────────
  async function archiveConversationByAccount(input: {
    accountId: string;
    conversationId: string;
  }) {
    await getRequiredConversationForAccount(input.accountId, input.conversationId);

    await db
      .delete(internalChatConversationMembers)
      .where(and(
        eq(internalChatConversationMembers.conversationId, input.conversationId),
        eq(internalChatConversationMembers.accountId, input.accountId),
      ));

    let remainingMembers;
    try {
      remainingMembers = await db.query.internalChatConversationMembers.findMany({
        where: eq(internalChatConversationMembers.conversationId, input.conversationId),
        limit: 1,
      });
    } catch (err) {
      forgeDebug({ scope: 'internal-chat', level: 'error', message: 'archiveConversation findMany failed', context: { conversationId: input.conversationId, error: err instanceof Error ? err.message : String(err) } });
      throw err;
    }

    if (remainingMembers.length === 0) {
      try {
        await db
          .delete(internalChatConversations)
          .where(eq(internalChatConversations.id, input.conversationId));
      } catch (err) {
        forgeDebug({ scope: 'internal-chat', level: 'error', message: 'archiveConversation delete failed', context: { conversationId: input.conversationId, error: err instanceof Error ? err.message : String(err) } });
        throw err;
      }
    }

    return {
      conversationId: input.conversationId,
      archived: true,
    };
  }

  return {
    getMessages,
    getMessagesByAccount,
    archiveConversationByAccount,
  };
}
