import path from 'node:path';

import { and, sql, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import {
  communicationMessages,
  communicationSchema,
} from '@mastra-engine/core';

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

    const agentDatabasePath = path.resolve(input.workspaceBasePath, agentId, 'database.db');
    const client = createClient({
      url: `file:${agentDatabasePath}`,
    });
    const communicationDb = drizzle(client, { schema: communicationSchema });

    try {
      const [unreadMessageRows, unreadConversationRows] = await Promise.all([
        communicationDb
          .select({
            count: sql<number>`count(*)`,
          })
          .from(communicationMessages)
          .where(eq(communicationMessages.unread, 1)),
        communicationDb
          .select({
            count: sql<number>`count(distinct ${communicationMessages.conversationId})`,
          })
          .from(communicationMessages)
          .where(eq(communicationMessages.unread, 1)),
      ]);

      const internalChatSummary = await input.internalChat.getUnreadSummary(agentId);

      return {
        unreadNotificationCount: unreadNotificationRows[0]?.count ?? 0,
        unreadConversationCount: (unreadConversationRows[0]?.count ?? 0) + internalChatSummary.unreadConversationCount,
        unreadMessageCount: (unreadMessageRows[0]?.count ?? 0) + internalChatSummary.unreadMessageCount,
      };
    } finally {
      await client.close();
    }
  };
}
