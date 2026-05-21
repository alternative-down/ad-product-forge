import { eq, desc } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';

import type {Database} from '../database/schema';
import { webhookRoutes, webhookEvents, WebhookRoute, WebhookEvent } from '../database/schema';
import { createId } from '../utils/id';
import { serializeError } from '../agents/agent-runner-error-formatting';

// WebhookEvent is imported from the database schema (InferModel<typeof webhookEvents>)

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
      await (db.insert(webhookRoutes) as unknown as { values: (v: unknown) => Promise<unknown> }).values(route as unknown);
    } catch (err) {
      forgeDebug({ scope: 'webhooks-store', level: 'error', message: 'createRoute DB write failed', context: { agentId: input.agentId, error: String(serializeError(err).message) } });
      throw err;
    }
    return route as unknown as WebhookRoute;
  }

  async function getRoute(routeId: string): Promise<WebhookRoute | null> {
    try {
      const rows = await db.select().from(webhookRoutes).where(eq(webhookRoutes.routeId, routeId)).limit(1);
      return (rows as unknown as WebhookRoute[])[0] ?? null;
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'getRoute DB read failed: ' + String(serializeError(err).message),
      });
      return null;
    }
  }

  async function listRoutesByAgent(agentId: string): Promise<WebhookRoute[]> {
    try {
      return await db.select().from(webhookRoutes).where(eq(webhookRoutes.agentId, agentId)).orderBy(desc(webhookRoutes.createdAt)) as unknown as WebhookRoute[];
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'listRoutesByAgent DB read failed: ' + String(serializeError(err).message),
      });
      return [];
    }
  }

  async function deactivateRoute(routeId: string): Promise<void> {
    try {
      await (db.update(webhookRoutes) as unknown as { set: (v: unknown) => { where: (cond: unknown) => Promise<unknown> } }).set({ isActive: false as unknown, updatedAt: Date.now() }).where(eq(webhookRoutes.routeId, routeId));
    } catch (err) {
      forgeDebug({ scope: 'webhooks-store', level: 'error', message: 'deactivateRoute DB write failed', context: { routeId, error: String(serializeError(err)) } });
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
      await (db.insert(webhookEvents) as unknown as { values: (v: unknown) => Promise<unknown> }).values(event as unknown);
    } catch (err) {
      forgeDebug({ scope: 'webhooks-store', level: 'error', message: 'createEvent DB write failed', context: { routeId: input.routeId, agentId: input.agentId, error: String(serializeError(err)) } });
      throw err;
    }
    return event as unknown as WebhookEvent;
  }

  async function listEventsByAgent(agentId: string, limit = 50): Promise<WebhookEvent[]> {
    try {
      return await db.select().from(webhookEvents).where(eq(webhookEvents.agentId, agentId)).orderBy(desc(webhookEvents.receivedAt)).limit(limit) as unknown as WebhookEvent[];
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'listEventsByAgent DB read failed: ' + String(serializeError(err).message),
      });
      return [];
    }
  }

  async function markProcessed(eventId: string): Promise<void> {
    try {
      await db.update(webhookEvents).set({ status: 'processed', processedAt: Date.now() }).where(eq(webhookEvents.eventId, eventId));
    } catch (err) {
      forgeDebug({ scope: 'webhooks-store', level: 'error', message: 'markProcessed DB write failed', context: { eventId, error: String(serializeError(err)) } });
      throw err;
    }
  }

  async function markFailed(eventId: string): Promise<void> {
    try {
      await db.update(webhookEvents).set({ status: 'failed', processedAt: Date.now() }).where(eq(webhookEvents.eventId, eventId));
    } catch (err) {
      forgeDebug({ scope: 'webhooks-store', level: 'error', message: 'markFailed DB write failed', context: { eventId, error: String(serializeError(err)) } });
      throw err;
    }
  }

  return { createRoute, getRoute, listRoutesByAgent, deactivateRoute, createEvent, listEventsByAgent, markProcessed, markFailed };
}