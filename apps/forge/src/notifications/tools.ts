import { createTool, type Tool } from '@forge-runtime/core';
import { z } from 'zod';

import type { Database } from '../database/client';
import { hasToolPermission } from '../capabilities/catalog';
import { withToolErrorLogging } from '../capabilities/tools/error-wrapper';
import { createAgentNotificationStore } from './store';

const NOTIFICATIONS_HINT =
  'Try again in a moment. If the problem persists, verify the notification store is available.';

export function createAgentNotificationTools(
  db: Database,
  agentId: string,
  allowedToolIds?: Set<string> | null,
) {
  const notifications = createAgentNotificationStore(db);
  const tools: Record<string, unknown> = {};

  if (hasToolPermission(allowedToolIds, 'list_agent_notifications')) {
    // L#19: list_agent_notifications is a PURE READ. It does NOT mark
    // notifications as read. To mark notifications as read, callers MUST
    // invoke mark_notifications_read. This eliminates the previous
    // hidden-side-effect bug.
    tools.list_agent_notifications = createTool({
      id: 'list_agent_notifications',
      description:
        'List your notifications (read-only). Does NOT mark them as read; use mark_notifications_read for that.',
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
        return await withToolErrorLogging({
          scope: 'notifications',
          op: 'list_agent_notifications',
          hint: NOTIFICATIONS_HINT,
          fn: () =>
            notifications.listNotifications({
              agentId,
              unreadOnly: input.unreadOnly ?? false,
              limit: input.limit ?? 20,
            }),
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'mark_notifications_read')) {
    // L#19: mark_notifications_read is the EXPLICIT mutation. Callers
    // pass the specific notificationIds they want to mark. Defaulting
    // to "all unread" or "all returned by last list" would reintroduce
    // the hidden-side-effect bug.
    tools.mark_notifications_read = createTool({
      id: 'mark_notifications_read',
      description:
        'Mark specific notifications as read. Requires the notificationIds to mark (caller must pass them explicitly).',
      inputSchema: z.object({
        notificationIds: z
          .array(z.string())
          .min(1)
          .describe('The IDs of the notifications to mark as read. Must be non-empty.'),
      }),
      execute: async (input) => {
        return await withToolErrorLogging({
          scope: 'notifications',
          op: 'mark_notifications_read',
          hint: NOTIFICATIONS_HINT,
          fn: () =>
            notifications.markNotificationsRead({
              agentId,
              notificationIds: input.notificationIds,
            }),
        });
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
