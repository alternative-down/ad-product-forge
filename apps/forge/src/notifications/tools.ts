import { createTool, type Tool, forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../agents/error-formatting';
import { z } from 'zod';

import type { Database } from '../database/client';
import { hasToolPermission } from '../capabilities/catalog';
import { createAgentNotificationStore } from './store';

export function createAgentNotificationTools(
  db: Database,
  agentId: string,
  allowedToolIds?: Set<string> | null,
) {
  const notifications = createAgentNotificationStore(db);
  const tools: Record<string, unknown> = {};

  if (hasToolPermission(allowedToolIds, 'list_agent_notifications')) {
    tools.list_agent_notifications = createTool({
      id: 'list_agent_notifications',
      description:
        'List your notifications. Listing them marks the returned notifications as read.',
      inputSchema: z.object({
        unreadOnly: z
          .boolean()
          .default(false)
          .describe('Set this to true if you only want unread notifications.'),
        limit: z
          .number()
          .int()
          .positive()
          .max(100)
          .default(20)
          .describe('Maximum number of notifications to return.'),
      }),
      execute: async (input) => {
        try {
          return await notifications.listNotifications({
            agentId,
            unreadOnly: input.unreadOnly ?? false,
            limit: input.limit ?? 20,
          });
        } catch (error) {
          forgeDebug({
            scope: 'notifications',
            level: 'error',
            message: '[notifications] list_agent_notifications failed',
            context: { error: errorMsg(error) },
          });
          return {
            valid: false,
            error: errorMsg(error),
            hint: 'Try again in a moment. If the problem persists, verify the notification store is available.',
          };
        }
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
