import { createId } from '@paralleldrive/cuid2';
import { and, desc, eq, isNull } from 'drizzle-orm';

import type { Database } from '../database/index.js';
import { agentNotifications } from '../database/schema.js';

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
  }) {
    const rows = await db.query.agentNotifications.findMany({
      where: and(
        eq(agentNotifications.agentId, input.agentId),
        input.unreadOnly ? isNull(agentNotifications.readAt) : undefined,
      ),
      orderBy: desc(agentNotifications.createdAt),
      limit: input.limit,
    });

    return rows.map((row) => ({
      notificationId: row.id,
      content: row.content,
      timestamp: row.createdAt,
      read: row.readAt !== null,
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

  async function markNotificationRead(agentId: string, notificationId: string) {
    const now = Date.now();
    const existing = await db.query.agentNotifications.findFirst({
      where: and(eq(agentNotifications.agentId, agentId), eq(agentNotifications.id, notificationId)),
    });

    if (!existing) {
      return false;
    }

    await db
      .update(agentNotifications)
      .set({ readAt: existing.readAt ?? now })
      .where(and(eq(agentNotifications.agentId, agentId), eq(agentNotifications.id, notificationId)));

    return true;
  }

  return {
    createNotification,
    listNotifications,
    getNotification,
    markNotificationRead,
  };
}
