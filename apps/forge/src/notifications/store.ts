import { createId } from '../utils/id';
import { forgeDebug } from '@forge-runtime/core';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';


import type {Database} from '../database/schema';
import { agentNotifications } from '../database/schema';

export function createAgentNotificationStore(db: Database) {
  async function createNotification(input: {
    agentId: string;
    content: string;
    createdAt?: number;
  }): Promise<{ id: string; agentId: string; content: string; createdAt: number; updatedAt: number; readAt: null } | null> {
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
        message: 'createNotification DB insert failed: ' + (err instanceof Error ? err.message : String(err)),
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
        input.unreadOnly ? isNull(agentNotifications.readAt) : undefined,
      ),
      orderBy: desc(agentNotifications.createdAt),
      limit: input.limit,
      });
    } catch (err) {
      forgeDebug({
        scope: 'notifications-store',
        level: 'error',
        runtimeId: input.agentId,
        message: 'listNotifications DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }

    const unreadNotificationIds = rows.filter((row) => row.readAt === null).map((row) => row.id);

    if ((input.markRead ?? true) && unreadNotificationIds.length > 0) {
      try {
        await db
          .update(agentNotifications)
          .set({ readAt: Date.now(), updatedAt: Date.now() })
          .where(and(eq(agentNotifications.agentId, input.agentId), inArray(agentNotifications.id, unreadNotificationIds)));
      } catch (err) {
        forgeDebug({
          scope: 'notifications-store',
          level: 'error',
          runtimeId: input.agentId,
          message: 'listNotifications mark-read update failed: ' + (err instanceof Error ? err.message : String(err)),
        });
      }
    }

    return rows.map((row) => ({
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
        where: and(eq(agentNotifications.agentId, agentId), eq(agentNotifications.id, notificationId)),
      });
    } catch (err) {
      forgeDebug({
        scope: 'notifications-store',
        level: 'error',
        runtimeId: agentId,
        message: 'getNotification DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }

    if (!row) {
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
