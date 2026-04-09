import { createId } from '../utils/id';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';

import type { Database } from '../database/index';
import { agentNotifications } from '../database/schema';

export function createAgentNotificationStore(db: Database) {
  async function createNotification(input: {
    agentId: string;
    content: string;
    createdAt?: number;
  }) {
    const now = input.createdAt ?? Date.now();
    const notification = {
      id: createId(),
      agentId: input.agentId,
      content: input.content,
      createdAt: now,
      readAt: null,
    };

    await db.insert(agentNotifications).values(notification);
    return notification;
  }

  async function listNotifications(input: {
    agentId: string;
    unreadOnly?: boolean;
    limit: number;
    markRead?: boolean;
  }) {
    const rows = await db.query.agentNotifications.findMany({
      where: and(
        eq(agentNotifications.agentId, input.agentId),
        input.unreadOnly ? isNull(agentNotifications.readAt) : undefined,
      ),
      orderBy: desc(agentNotifications.createdAt),
      limit: input.limit,
    });

    const unreadNotificationIds = rows.filter((row) => row.readAt === null).map((row) => row.id);

    if ((input.markRead ?? true) && unreadNotificationIds.length > 0) {
      await db
        .update(agentNotifications)
        .set({ readAt: Date.now() })
        .where(and(eq(agentNotifications.agentId, input.agentId), inArray(agentNotifications.id, unreadNotificationIds)));
    }

    return rows.map((row) => ({
      notificationId: row.id,
      content: row.content,
      timestamp: row.createdAt,
      read: (input.markRead ?? true) ? true : row.readAt !== null,
    }));
  }

  async function getNotification(agentId: string, notificationId: string) {
    const row = await db.query.agentNotifications.findFirst({
      where: and(eq(agentNotifications.agentId, agentId), eq(agentNotifications.id, notificationId)),
    });

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
