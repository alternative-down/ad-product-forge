import { and, desc, eq, gte, inArray, like, lte, sql } from 'drizzle-orm';

import type { CommunicationProviderMessage } from '@forge-runtime/core';

import {
  internalChatAccounts,
  internalChatConversationMembers,
  internalChatConversations,
  internalChatMessageReads,
  internalChatMessages,
} from '../database/schema';
import { parseFilterDate } from './filter-helpers';

import type { Database } from '../database/client';

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



/**
 * Escape SQL LIKE wildcards in user input to prevent filter bypass.
 *
 * SQL LIKE has three special characters that must be escaped to be treated
 * as literals:
 *   - `%` matches any sequence (zero or more)
 *   - `_` matches any single character
 *   - `\\` is the escape character itself
 *
 * Without escaping, an attacker can:
 *   - Pass `%` to bypass content filtering (filter bypass)
 *   - Pass `_` to widen matching to single chars
 *   - Enumerate via partial-match (e.g., `password%`)
 *
 * NOTE: Drizzle parameterizes the LIKE value, so this is NOT a SQL injection
 * (no raw SQL); it's specifically a LIKE-wildcard filter bypass.
 *
 * @param input  Raw user-supplied search string
 * @returns      Escaped string safe to wrap in `%...%`
 */
function escapeLikePattern(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => '\\' + ch);
}

export function createInternalChatMessages(db: Database, deps: InternalChatMessagesDeps) {
  const {
    requireConversationMembership,
    requireConversationMembershipByAccount,
    getRequiredConversationForAccount,
    readMessageAttachments,
  } = deps;

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
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      ...(input.query ? [like(internalChatMessages.content, `%${escapeLikePattern(input.query)}%`)] : []),
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
      .limit(input.limit)
      .all();

    const unreadMessageIds = rows
      .filter((row) => row.unread === 1)
      .map((row) => row.messageId);

    if (unreadMessageIds.length > 0) {
      await db
        .update(internalChatMessageReads)
        .set({ readAt: Date.now() })
        .where(
          and(
            eq(internalChatMessageReads.agentId, input.agentId),
            inArray(internalChatMessageReads.messageId, unreadMessageIds),
          ),
        );
    }

    return (await Promise.all(
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
    )) as CommunicationProviderMessage[];
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
      // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
      ...(input.query ? [like(internalChatMessages.content, `%${escapeLikePattern(input.query)}%`)] : []),
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
        internalChatAccounts,
        eq(internalChatAccounts.id, internalChatMessages.authorAccountId),
      )
      .innerJoin(
        internalChatMessageReads,
        and(
          eq(internalChatMessageReads.messageId, internalChatMessages.id),
          eq(internalChatMessageReads.agentId, internalChatAccounts.agentId),
        ),
      )
      .where(and(...filters))
      .orderBy(desc(internalChatMessages.createdAt))
      .offset(input.offset)
      .limit(input.limit)
      .all();

    return (await Promise.all(
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
    )) as CommunicationProviderMessage[];
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
      .where(
        and(
          eq(internalChatConversationMembers.conversationId, input.conversationId),
          eq(internalChatConversationMembers.accountId, input.accountId),
        ),
      );

    const remainingMembers = await db.query.internalChatConversationMembers.findMany({
      where: eq(internalChatConversationMembers.conversationId, input.conversationId),
      limit: 1,
    });

    if (remainingMembers.length === 0) {
      await db
        .delete(internalChatConversations)
        .where(eq(internalChatConversations.id, input.conversationId));
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
