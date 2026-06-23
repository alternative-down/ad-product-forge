import { createId } from '../utils/id';
import { withDbErrorLogging } from '../database/error-logging';
import { errorMsg } from '../agents/error-formatting';
import { forgeDebug } from '@forge-runtime/core';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import type { Database } from '../database/client';
import {
  agentNotifications,
  type AgentNotification,
} from '../database/schema';

/** Maximum allowed length of a notification content string (16KB).
 * Exceeding this limit returns null and logs an error via forgeDebug.
 * Prevents DB bloat and protects listNotifications performance.
 */
const MAX_NOTIFICATION_CONTENT_LENGTH = 16_384;

export type AgentNotificationStore = ReturnType<typeof createAgentNotificationStore>;

export function createAgentNotificationStore(db: Database) {
  async function createNotification(input: {
    agentId: string;
    content: string;
    createdAt?: number;
  }): Promise<{
    id: string;
    agentId: string;
    content: string;
    createdAt: number;
    updatedAt: number;
    readAt: null;
  } | null> {
    if (input.content.length > MAX_NOTIFICATION_CONTENT_LENGTH) {
      forgeDebug({
        scope: 'notifications-store',
        level: 'error',
        runtimeId: input.agentId,
        message: 'createNotification content exceeds max length',
        context: { length: input.content.length, max: MAX_NOTIFICATION_CONTENT_LENGTH },
      });
      throw new Error(
        'createNotification content length ' + input.content.length +
        ' exceeds max ' + MAX_NOTIFICATION_CONTENT_LENGTH
      );
    }
    const now = input.createdAt ?? Date.now();
    const notification = {
      id: createId(),
      agentId: input.agentId,
      content: input.content,
      createdAt: now,
      updatedAt: now,
      readAt: null,
    };

    return await withDbErrorLogging({
      scope: 'notifications-store',
      op: 'createNotification',
      verb: 'write',
      mode: 'return-null',
      context: { runtimeId: input.agentId, id: notification.id },
      fn: async () => {
        await db.insert(agentNotifications).values(notification);
        return notification;
      },
    });
  }

  // L#19: listNotifications is a PURE READ. It does NOT mutate the database.
  // To mark notifications as read, callers MUST use markNotificationsRead
  // (or the mark_notifications_read tool). This eliminates the previous
  // bug where listing silently marked notifications as read by default.
  async function listNotifications(input: {
    agentId: string;
    unreadOnly?: boolean;
    limit: number;
  }) {
    const rows = await withDbErrorLogging({
      scope: 'notifications-store',
      op: 'listNotifications',
      verb: 'read',
      mode: 'return-empty-array',
      context: { runtimeId: input.agentId, limit: input.limit, unreadOnly: input.unreadOnly },
      fn: () =>
        db.query.agentNotifications.findMany({
          where: and(
            eq(agentNotifications.agentId, input.agentId),
            input.unreadOnly != null
              ? isNull(agentNotifications.readAt)
              : undefined,
          ),
          orderBy: desc(agentNotifications.createdAt),
          limit: input.limit,
        }),
    });

    // The "read" field reflects the PERSISTED state in the database, not
    // a caller-controlled flag. This is the L#19 invariant: a read
    // operation reports state, it does not impose state.
    return rows.map((row: AgentNotification) => ({
      notificationId: row.id,
      content: row.content,
      timestamp: row.createdAt,
      read: row.readAt !== null,
    }));
  }

  // L#19: markNotificationsRead is the EXPLICIT mutation counterpart to
  // listNotifications. It requires the caller to pass the specific
  // notificationIds to mark, eliminating the previous "default-true"
  // surprise where listing silently marked unread notifications as read.
  async function markNotificationsRead(input: {
    agentId: string;
    notificationIds: string[];
  }): Promise<{ updatedCount: number }> {
    if (input.notificationIds.length === 0) {
      return { updatedCount: 0 };
    }
    try {
      const updated = (await db
        .update(agentNotifications)
        .set({ readAt: Date.now(), updatedAt: Date.now() })
        .where(
          and(
            eq(agentNotifications.agentId, input.agentId),
            inArray(agentNotifications.id, input.notificationIds),
          ),
        )
        .returning({ id: agentNotifications.id })) as unknown as Array<{ id: string }>;
      return { updatedCount: updated.length };
    } catch (err) {
      // markNotificationsRead no longer silently swallows DB errors. We log
      // the error context and rethrow so callers can distinguish actual
      // updates from no-ops (see #5977).
      forgeDebug({
        scope: 'notifications-store',
        level: 'error',
        runtimeId: input.agentId,
        message: 'markNotificationsRead DB update failed: ' + errorMsg(err),
      });
      throw err;
    }
  }

  async function getNotification(agentId: string, notificationId: string) {
    const row = await withDbErrorLogging({
      scope: 'notifications-store',
      op: 'getNotification',
      verb: 'read',
      mode: 'return-null',
      context: { runtimeId: agentId, notificationId },
      fn: () =>
        db.query.agentNotifications.findFirst({
          where: and(
            eq(agentNotifications.agentId, agentId),
            eq(agentNotifications.id, notificationId),
          ),
        }),
    });

    if (row == null) {
      return null;
    }

    return {
      notificationId: row.id,
      content: row.content,
      timestamp: row.createdAt,
      read: row.readAt !== null,
    };
  }

  return {
    createNotification,
    listNotifications,
    markNotificationsRead,
    getNotification,
  };
}
