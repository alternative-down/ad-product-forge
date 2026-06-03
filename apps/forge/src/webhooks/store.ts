import { eq, desc, and, sql } from 'drizzle-orm';
import { errorMsg } from '../agents/error-formatting';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/schema';
import { webhookRoutes, webhookEvents, WebhookRoute, WebhookEvent, NewWebhookRoute, NewWebhookEvent } from '../database/schema';
import { createId } from '../utils/id';

export type CreateEventResult =
  | { kind: 'created'; eventId: string }
  | { kind: 'duplicate'; eventId: string };




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
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await db.insert(webhookRoutes).values(route as NewWebhookRoute);
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'createRoute DB write failed',
        context: { agentId: input.agentId, error: errorMsg(err) },
      });
      throw err;
    }
    return route as WebhookRoute;
  }

  async function getRoute(routeId: string): Promise<WebhookRoute | null> {
    try {
      const rows = await db
        .select()
        .from(webhookRoutes)
        .where(eq(webhookRoutes.routeId, routeId))
        .limit(1)
        .all();
      return (rows as WebhookRoute[])[0] ?? null;
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'getRoute DB read failed: ' + errorMsg(err),
      });
      return null;
    }
  }

  async function listRoutesByAgent(agentId: string): Promise<WebhookRoute[]> {
    try {
      return (await db
        .select()
        .from(webhookRoutes)
        .where(eq(webhookRoutes.agentId, agentId))
        .orderBy(desc(webhookRoutes.createdAt))
        .all()) as WebhookRoute[];
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'listRoutesByAgent DB read failed: ' + errorMsg(err),
      });
      return [];
    }
  }

  async function deactivateRoute(routeId: string): Promise<void> {
    try {
      await db.update(webhookRoutes)
        .set({ isActive: 0, updatedAt: Date.now() })
        .where(eq(webhookRoutes.routeId, routeId));
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'deactivateRoute DB write failed',
        context: { routeId, error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function createEvent(input: {
    routeId: string;
    agentId: string;
    payload: Record<string, unknown>;
    headers: Record<string, string>;
    idempotencyKey?: string;
  }): Promise<CreateEventResult> {
    const now = Date.now();
    const event = {

      eventId: createId(),
      routeId: input.routeId,
      agentId: input.agentId,
      payload: JSON.stringify(input.payload),
      headers: JSON.stringify(input.headers),
      idempotencyKey: input.idempotencyKey ?? null,
      status: 'pending' as const,
      createdAt: now,
      updatedAt: now,
      receivedAt: now,
      processedAt: null,
    };

    // AC-3: no idempotencyKey (or empty string) → no dedup, original behavior.
    // (T4, T9: missing/empty key MUST behave as today.)
    if (input.idempotencyKey == null || input.idempotencyKey === '') {
      try {
        await db.insert(webhookEvents).values(event as NewWebhookEvent);
      } catch (err) {
        forgeDebug({
          scope: 'webhooks-store',
          level: 'error',
          message: 'createEvent DB write failed',
          context: {
            routeId: input.routeId,
            agentId: input.agentId,
            error: errorMsg(err),
          },
        });
        throw err;
      }
      return { kind: 'created', eventId: event.eventId };
    }

    // AC-1, AC-2, AC-4: idempotencyKey present.
    //   - AC-2: scoped per route (composite unique on (routeId, idempotencyKey))
    //   - AC-4: atomic INSERT OR IGNORE → 10 parallel requests converge to 1 row
    let insertedRows: Array<{ eventId: string }>;
    try {
      insertedRows = (await db
        .insert(webhookEvents)
        .values(event as NewWebhookEvent)
        .onConflictDoNothing({
          target: [webhookEvents.routeId, webhookEvents.idempotencyKey],
          where: sql`${webhookEvents.idempotencyKey} IS NOT NULL`,
        })
        .returning({ eventId: webhookEvents.eventId })) as Array<{ eventId: string }>;
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'createEvent DB write failed',
        context: {
          routeId: input.routeId,
          agentId: input.agentId,
          error: errorMsg(err),
        },
      });
      throw err;
    }

    if (insertedRows.length > 0) {
      return { kind: 'created', eventId: insertedRows[0].eventId };
    }

    // Conflict: another request inserted the same (routeId, idempotencyKey) first.
    // Look up the existing event to return its eventId (AC-1: replay returns same eventId).
    const existing = (await db
      .select({ eventId: webhookEvents.eventId })
      .from(webhookEvents)
      .where(
        and(
          eq(webhookEvents.routeId, input.routeId),
          eq(webhookEvents.idempotencyKey, input.idempotencyKey),
        ),
      )
      .limit(1)
      .all()) as Array<{ eventId: string }>;

    if (existing.length === 0) {
      // Should not happen — INSERT OR IGNORE returned 0 but SELECT finds nothing.
      // Surface a clear error rather than returning a fabricated response.
      throw new Error(
        `Idempotency conflict but no existing event found for route=${input.routeId} key=${input.idempotencyKey}`,
      );
    }

    return { kind: 'duplicate', eventId: existing[0].eventId };
  }

  async function listEventsByAgent(agentId: string, limit = 50): Promise<WebhookEvent[]> {
    try {
      return (await db
        .select()
        .from(webhookEvents)
        .where(eq(webhookEvents.agentId, agentId))
        .orderBy(desc(webhookEvents.receivedAt))
        .limit(limit)
        .all()) as WebhookEvent[];
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'listEventsByAgent DB read failed: ' + errorMsg(err),
      });
      return [];
    }
  }

  async function markProcessed(eventId: string): Promise<void> {
    try {
      await db
        .update(webhookEvents)
        .set({ status: 'processed', processedAt: Date.now() })
        .where(eq(webhookEvents.eventId, eventId));
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'markProcessed DB write failed',
        context: { eventId, error: errorMsg(err) },
      });
      throw err;
    }
  }

  async function markFailed(eventId: string): Promise<void> {
    try {
      await db
        .update(webhookEvents)
        .set({ status: 'failed', processedAt: Date.now() })
        .where(eq(webhookEvents.eventId, eventId));
    } catch (err) {
      forgeDebug({
        scope: 'webhooks-store',
        level: 'error',
        message: 'markFailed DB write failed',
        context: { eventId, error: errorMsg(err) },
      });
      throw err;
    }
  }

  return {
    createRoute,
    getRoute,
    listRoutesByAgent,
    deactivateRoute,
    createEvent,
    listEventsByAgent,
    markProcessed,
    markFailed,
  };
}
