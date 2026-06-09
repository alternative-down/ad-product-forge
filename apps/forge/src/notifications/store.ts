import { createId } from '../utils/id';
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
      return null;
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

    try {
      await db.insert(agentNotifications).values(notification);
    } catch (err) {
      forgeDebug({
        scope: 'notifications-store',
        level: 'error',
        runtimeId: input.agentId,
        message: 'createNotification DB insert failed: ' + errorMsg(err),
      });
      return null;
    }
    return notification;
  }

  async function listNotifications(input: {
    agentId: string;
    unreadOnly?: boolean;
    limit: number;
    markRead?: boolean;
  }) {
    let rows;
    try {
      rows = await db.query.agentNotifications.findMany({
        where: and(
          eq(agentNotifications.agentId, input.agentId),
          input.unreadOnly !== null && input.unreadOnly !== undefined
            ? isNull(agentNotifications.readAt)
            : undefined,
        ),
        orderBy: desc(agentNotifications.createdAt),
        limit: input.limit,
      });
    } catch (err) {
      forgeDebug({
        scope: 'notifications-store',
        level: 'error',
        runtimeId: input.agentId,
        message: 'listNotifications DB read failed: ' + errorMsg(err),
      });
      return [];
    }

    const unreadNotificationIds = rows
      .filter((row: AgentNotification) => row.readAt === null)
      .map((row: AgentNotification) => row.id);

    if ((input.markRead ?? true) && unreadNotificationIds.length > 0) {
      try {
        await db
          .update(agentNotifications)
          .set({ readAt: Date.now(), updatedAt: Date.now() })
          .where(
            and(
              eq(agentNotifications.agentId, input.agentId),
              inArray(agentNotifications.id, unreadNotificationIds),
            ),
          );
      } catch (err) {
        forgeDebug({
          scope: 'notifications-store',
          level: 'error',
          runtimeId: input.agentId,
          message: 'listNotifications mark-read update failed: ' + errorMsg(err),
        });
      }
    }

    return rows.map((row: AgentNotification) => ({
      notificationId: row.id,
      content: row.content,
      timestamp: row.createdAt,
      read: (input.markRead ?? true) ? true : row.readAt !== null,
    }));
  }

  async function getNotification(agentId: string, notificationId: string) {
    let row;
    try {
      row = await db.query.agentNotifications.findFirst({
        where: and(
          eq(agentNotifications.agentId, agentId),
          eq(agentNotifications.id, notificationId),
        ),
      });
    } catch (err) {
      forgeDebug({
        scope: 'notifications-store',
        level: 'error',
        runtimeId: agentId,
        message: 'getNotification DB read failed: ' + errorMsg(err),
      });
      return null;
    }

    if (row === null || row === undefined) {
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
    getNotification,
  };
}
