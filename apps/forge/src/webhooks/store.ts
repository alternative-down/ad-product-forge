import { eq, desc } from 'drizzle-orm';
import type { Database } from '../database/index';
import { webhookRoutes, webhookEvents } from '../database/schema';
import { createId } from '../utils/id';

export type WebhookRoute = typeof webhookRoutes.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

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
    const rows = await db.select().from(webhookRoutes).where(eq(webhookRoutes.routeId, routeId)).limit(1);
    return rows[0] as WebhookRoute ?? null;
  }

  async function listRoutesByAgent(agentId: string): Promise<WebhookRoute[]> {
    return await db.select().from(webhookRoutes).where(eq(webhookRoutes.agentId, agentId)).orderBy(desc(webhookRoutes.createdAt)) as WebhookRoute[];
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
    return await db.select().from(webhookEvents).where(eq(webhookEvents.agentId, agentId)).orderBy(desc(webhookEvents.receivedAt)).limit(limit) as WebhookEvent[];
  }

  async function markProcessed(eventId: string): Promise<void> {
    await db.update(webhookEvents).set({ status: 'processed', processedAt: Date.now() }).where(eq(webhookEvents.eventId, eventId));
  }

  async function markFailed(eventId: string): Promise<void> {
    await db.update(webhookEvents).set({ status: 'failed', processedAt: Date.now() }).where(eq(webhookEvents.eventId, eventId));
  }

  return { createRoute, getRoute, listRoutesByAgent, deactivateRoute, createEvent, listEventsByAgent, markProcessed, markFailed };
}