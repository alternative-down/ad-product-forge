import { and, isNull, eq, sql } from 'drizzle-orm';
import { internalChatMessageReads, internalChatMessages } from '../database/schema';

import type { Database } from '../database/client';
import { forgeDebug } from '@forge-runtime/core';

// =============================================================================
// Unread summary
// =============================================================================

/**
 * Aggregate unread counts returned by `getUnreadSummary`.
 * Canonical shape: declared at the implementation site so the delegate
 * signature in `internal-chat-reads.ts` can mirror it without leaking
 * `unknown` to consumers.
 */
export type UnreadSummary = {
  unreadMessageCount: number;
  unreadConversationCount: number;
};

export function createInternalChatUnread(db: Database) {
  /**
   * Returns aggregate unread counts for an agent.
   */
  async function getUnreadSummary(agentId: string): Promise<UnreadSummary> {
    try {
      const rows = await db
        .select({
          unreadMessageCount: sql<number>`count(*)`,
          unreadConversationCount: sql<number>`count(distinct ${internalChatMessages.conversationId})`,
        })
        .from(internalChatMessageReads)
        .innerJoin(
          internalChatMessages,
          eq(internalChatMessages.id, internalChatMessageReads.messageId),
        )
        .where(
          and(
            eq(internalChatMessageReads.agentId, agentId),
            isNull(internalChatMessageReads.readAt),
          ),
        )
        .all();

      return {
        unreadMessageCount: rows[0]?.unreadMessageCount ?? 0,
        unreadConversationCount: rows[0]?.unreadConversationCount ?? 0,
      };
    } catch (err) {
      forgeDebug({
        scope: 'internal-chat-unread',
        level: 'error',
        message: '[internal-chat-unread] getUnreadSummary failed',
        context: { error: errorMsg(err) },
      });
      throw err;
    }
  }

  return { getUnreadSummary };
}
import { errorMsg } from '../agents/error-formatting';
