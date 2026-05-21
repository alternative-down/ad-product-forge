import { eq, desc } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';

import type {Database} from '../database/schema';
import { webhookRoutes, webhookEvents, WebhookRoute } from '../database/schema';
import { createId } from '../utils/id';
import { serializeError } from '../agents/agent-runner-error-formatting';

// WebhookRoute and WebhookEvent types are exported from the database schema
// Type for webhook event rows
type WebhookEvent = any; // TODO: fix Drizzle 0.26 $inferSelect


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
    try {
      await (db.insert(webhookRoutes) as any).values(route as any);
    } catch (err) {
      forgeDebug({ scope: 'webhooks-store', level: 'error', message: 'createRoute: db.insert failed', context: { agentId: input.agentId, error: String(serializeError(err)) } });
      throw err;
    }
    return route as unknown as WebhookRoute;
  }

  async function getRoute(routeId: string): Promise<WebhookRoute | null> {
    try {
      const rows = await db.select().from(webhookRoutes).where(eq(webhookRoutes.routeId, routeId)).limit(1);
      return (rows as unknown as any[])[0] ?? null;
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'getRoute DB read failed: ' + (String(serializeError(err))),
      });
      return null;
    }
  }

  async function listRoutesByAgent(agentId: string): Promise<WebhookRoute[]> {
    try {
      const _rows = await db.select().from(webhookRoutes).where(eq(webhookRoutes.agentId, agentId)).orderBy(desc(webhookRoutes.createdAt)); return (_rows as unknown as any[]) as WebhookRoute[];
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'listRoutesByAgent DB read failed: ' + (String(serializeError(err))),
      });
      return [];
    }
  }

  async function deactivateRoute(routeId: string): Promise<void> {
    try {
      await (db.update(webhookRoutes) as any).set({ isActive: false, updatedAt: Date.now() }).where(eq(webhookRoutes.routeId, routeId));
    } catch (err) {
      forgeDebug({ scope: 'webhooks-store', level: 'error', message: 'deactivateRoute: db.update failed', context: { routeId, error: String(serializeError(err)) } });
      throw err;
    }
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
      createdAt: now,
      updatedAt: now,
      receivedAt: now,
      processedAt: null,
    };
    try {
      await (db.insert(webhookEvents) as any).values(event as any);
    } catch (err) {
      forgeDebug({ scope: 'webhooks-store', level: 'error', message: 'createEvent: db.insert failed', context: { routeId: input.routeId, agentId: input.agentId, error: String(serializeError(err)) } });
      throw err;
    }
    return event as unknown as WebhookEvent;
  }

  async function listEventsByAgent(agentId: string, limit = 50): Promise<WebhookEvent[]> {
    try {
      const _evRows = await db.select().from(webhookEvents).where(eq(webhookEvents.agentId, agentId)).orderBy(desc(webhookEvents.receivedAt)).limit(limit); return (_evRows as unknown as any[]) as WebhookEvent[];
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'listEventsByAgent DB read failed: ' + (String(serializeError(err))),
      });
      return [];
    }
  }

  async function markProcessed(eventId: string): Promise<void> {
    try {
      await db.update(webhookEvents).set({ status: 'processed', processedAt: Date.now() }).where(eq(webhookEvents.eventId, eventId));
    } catch (err) {
      forgeDebug({ scope: 'webhooks-store', level: 'error', message: 'markProcessed: db.update failed', context: { eventId, error: String(serializeError(err)) } });
      throw err;
    }
  }

  async function markFailed(eventId: string): Promise<void> {
    try {
      await db.update(webhookEvents).set({ status: 'failed', processedAt: Date.now() }).where(eq(webhookEvents.eventId, eventId));
    } catch (err) {
      forgeDebug({ scope: 'webhooks-store', level: 'error', message: 'markFailed: db.update failed', context: { eventId, error: String(serializeError(err)) } });
      throw err;
    }
  }

  return { createRoute, getRoute, listRoutesByAgent, deactivateRoute, createEvent, listEventsByAgent, markProcessed, markFailed };
}