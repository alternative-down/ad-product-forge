import { eq, desc } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';

import type {Database} from '../database/schema';
import { webhookRoutes, webhookEvents, WebhookRoute } from '../database/schema';
import { createId } from '../utils/id';

// WebhookRoute and WebhookEvent types are exported from the database schema
// Type for webhook event rows
type WebhookEvent = typeof webhookEvents.$inferSelect;


export function createWebhookStore(db: Database) {
  async function createRoute(input: {
    agentId: string;
    name: string;
    secret?: string;
  }): Promise<WebhookRoute> {
    const now = Date.now();
    const route = {
      routeId: createId(),
      agentId: input.agentId,
      name: input.name,
      secret: input.secret ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
      await db.insert(webhookRoutes).values(route);
    return route as WebhookRoute;
  }

  async function getRoute(routeId: string): Promise<WebhookRoute | null> {
    try {
      const rows = await db.select().from(webhookRoutes).where(eq(webhookRoutes.routeId, routeId)).limit(1);
      return rows[0] as WebhookRoute ?? null;
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'getRoute DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return null;
    }
  }

  async function listRoutesByAgent(agentId: string): Promise<WebhookRoute[]> {
    try {
      return await db.select().from(webhookRoutes).where(eq(webhookRoutes.agentId, agentId)).orderBy(desc(webhookRoutes.createdAt)) as WebhookRoute[];
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'listRoutesByAgent DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }
  }

  async function deactivateRoute(routeId: string): Promise<void> {
      await db.update(webhookRoutes).set({ isActive: false, updatedAt: Date.now() }).where(eq(webhookRoutes.routeId, routeId));
  }

  async function createEvent(input: {
    routeId: string;
    agentId: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<WebhookEvent> {
    const now = Date.now();
    const event = {
      eventId: createId(),
      routeId: input.routeId,
      agentId: input.agentId,
      payload: input.payload,
      headers: input.headers,
      idempotencyKey: input.idempotencyKey ?? null,
      status: 'pending' as const,
      receivedAt: now,
      processedAt: null,
    };
      await db.insert(webhookEvents).values(event);
    return event as WebhookEvent;
  }

  async function listEventsByAgent(agentId: string, limit = 50): Promise<WebhookEvent[]> {
    try {
      return await db.select().from(webhookEvents).where(eq(webhookEvents.agentId, agentId)).orderBy(desc(webhookEvents.receivedAt)).limit(limit) as WebhookEvent[];
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'listEventsByAgent DB read failed: ' + (err instanceof Error ? err.message : String(err)),
      });
      return [];
    }
  }

  async function markProcessed(eventId: string): Promise<void> {
      await db.update(webhookEvents).set({ status: 'processed', processedAt: Date.now() }).where(eq(webhookEvents.eventId, eventId));
  }

  async function markFailed(eventId: string): Promise<void> {
      await db.update(webhookEvents).set({ status: 'failed', processedAt: Date.now() }).where(eq(webhookEvents.eventId, eventId));
  }

  return { createRoute, getRoute, listRoutesByAgent, deactivateRoute, createEvent, listEventsByAgent, markProcessed, markFailed };
}