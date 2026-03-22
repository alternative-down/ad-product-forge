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
    });
  }

  if (hasToolPermission(allowedToolIds, 'mark_agent_notification_read')) {
    tools.mark_agent_notification_read = createTool({
      id: 'mark_agent_notification_read',
      description: 'Mark one notification for this agent as read.',
      inputSchema: z.object({
        notificationId: z.string().min(1),
      }),
      execute: async (input) => ({
        success: await notifications.markNotificationRead(agentId, input.notificationId),
      }),
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
