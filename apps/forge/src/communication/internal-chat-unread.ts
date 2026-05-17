import { and, isNull, eq, sql } from 'drizzle-orm';
import { internalChatMessageReads, internalChatMessages } from '../database/schema';

import type {Database} from '../database/schema';
import { forgeDebug } from '@forge-runtime/core';

// =============================================================================
// Unread summary
// =============================================================================

export function createInternalChatUnread(db: Database) {

  /**
   * Returns aggregate unread counts for an agent.
   */
  async function getUnreadSummary(agentId: string) {
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
        .where(and(
          eq(internalChatMessageReads.agentId, agentId),
          isNull(internalChatMessageReads.readAt),
        ));

      return {
        unreadMessageCount: (rows as any)[0]?.unreadMessageCount ?? 0,
        unreadConversationCount: (rows as any)[0]?.unreadConversationCount ?? 0,
      };
    } catch (err) {
      forgeDebug({ scope: 'internal-chat-unread', level: 'error', message: '[internal-chat-unread] getUnreadSummary failed', context: { error: err instanceof Error ? err.message : String(err) }});
      throw err;
    }
  }

  return { getUnreadSummary };
}