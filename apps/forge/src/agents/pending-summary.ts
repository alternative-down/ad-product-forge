import { and, sql, eq, isNull } from 'drizzle-orm';

import type { Database } from '../database/index';
import { agentNotifications } from '../database/schema';
import type { InternalChatService } from '../communication/internal-chat-service';

export type AgentPendingSummary = {
  unreadNotificationCount: number;
  unreadConversationCount: number;
  unreadMessageCount: number;
};

export function createAgentPendingSummaryReader(input: {
  db: Database;
  workspaceBasePath: string;
  internalChat: InternalChatService;
}) {
  return async function getAgentPendingSummary(agentId: string): Promise<AgentPendingSummary> {
    const unreadNotificationRows = await input.db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(agentNotifications)
      .where(and(eq(agentNotifications.agentId, agentId), isNull(agentNotifications.readAt)));

    const internalChatSummary = await input.internalChat.getUnreadSummary(agentId);

    return {
      unreadNotificationCount: unreadNotificationRows[0]?.count ?? 0,
      unreadConversationCount: internalChatSummary.unreadConversationCount,
      unreadMessageCount: internalChatSummary.unreadMessageCount,
    };
  };
}
