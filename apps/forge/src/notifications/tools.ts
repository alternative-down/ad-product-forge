import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index.js';
import { createAgentNotificationStore } from './store.js';

export function createAgentNotificationTools(db: Database, agentId: string) {
  const notifications = createAgentNotificationStore(db);

  return {
    list_agent_notifications: createTool({
      id: 'list_agent_notifications',
      description: 'List the latest notifications for this agent.',
      inputSchema: z.object({
        unreadOnly: z.boolean().default(false),
        limit: z.number().int().positive().max(100).default(20),
      }),
      execute: async (input) => notifications.listNotifications({
        agentId,
        unreadOnly: input.unreadOnly ?? false,
        limit: input.limit ?? 20,
      }),
    }),
    get_agent_notification: createTool({
      id: 'get_agent_notification',
      description: 'Get one notification for this agent by notificationId.',
      inputSchema: z.object({
        notificationId: z.string().min(1),
      }),
      execute: async (input) => notifications.getNotification(agentId, input.notificationId),
    }),
    mark_agent_notification_read: createTool({
      id: 'mark_agent_notification_read',
      description: 'Mark one notification for this agent as read.',
      inputSchema: z.object({
        notificationId: z.string().min(1),
      }),
      execute: async (input) => ({
        success: await notifications.markNotificationRead(agentId, input.notificationId),
      }),
    }),
  };
}
