import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { hasToolPermission } from '../capabilities/catalog';
import { createAgentNotificationStore } from './store';

export function createAgentNotificationTools(db: Database, agentId: string, allowedToolIds?: Set<string> | null) {
  const notifications = createAgentNotificationStore(db);
  const tools: Record<string, unknown> = {};

  if (hasToolPermission(allowedToolIds, 'list_agent_notifications')) {
    tools.list_agent_notifications = createTool({
      id: 'list_agent_notifications',
      description: 'View all your notifications including task assignments, system alerts, and messages from other agents.',
      inputSchema: z.object({
        unreadOnly: z.boolean().default(false),
        limit: z.number().int().positive().max(100).default(20),
      }),
      execute: async (input) => {
        try {
          return await notifications.listNotifications({
            agentId,
            unreadOnly: input.unreadOnly ?? false,
            limit: input.limit ?? 20,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Try again in a moment. If the problem persists, verify the notification store is available.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'mark_agent_notification_read')) {
    tools.mark_agent_notification_read = createTool({
      id: 'mark_agent_notification_read',
      description: 'Mark a notification as read to remove it from your unread count. Use after reviewing or acting on a notification.',
      inputSchema: z.object({
        notificationId: z.string().min(1),
      }),
      execute: async (input) => {
        try {
          const marked = await notifications.markNotificationRead(agentId, input.notificationId);
          return {
            valid: true,
            notificationId: input.notificationId,
            marked,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_notifications to confirm the notificationId is correct and belongs to you.',
          };
        }
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
