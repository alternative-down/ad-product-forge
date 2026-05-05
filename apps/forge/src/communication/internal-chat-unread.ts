import { and, isNull, eq, sql } from 'drizzle-orm';
import { internalChatMessageReads, internalChatMessages } from '../database/schema';
import type { Database } from '../database/index';

// =============================================================================
// Unread summary
// =============================================================================

export function createInternalChatUnread(db: Database) {

  /**
   * Returns aggregate unread counts for an agent.
   */
  async function getUnreadSummary(agentId: string) {
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
      .where(and(
        eq(internalChatMessageReads.agentId, agentId),
        isNull(internalChatMessageReads.readAt),
      ));

    return {
      unreadMessageCount: rows[0]?.unreadMessageCount ?? 0,
      unreadConversationCount: rows[0]?.unreadConversationCount ?? 0,
    };
  }

  return { getUnreadSummary };
}