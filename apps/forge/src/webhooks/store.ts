import { eq, desc, and, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import { withDbErrorLogging } from '../database/error-logging';

import type { Database } from '../database/client';
import { webhookRoutes, webhookEvents, WebhookRoute, WebhookEvent, NewWebhookRoute, NewWebhookEvent } from '../database/schema';
import { createId } from '../utils/id';
import { encryptSecret, decryptSecret } from '../encryption/crypto';

export type CreateEventResult =
  | { kind: 'created'; eventId: string }
  | { kind: 'duplicate'; eventId: string };

/**
 * Plaintext secret bytes used for HMAC verification (#5876) and
 * webhook source configuration. NOT persisted — only the
 * AES-256-GCM ciphertext (secret_encrypted) is stored.
 *
 * Encoding: 32 bytes random → base64url → 43 chars URL-safe.
 * The webhooks API returns this ONCE on create/rotate; admin must
 * store it client-side immediately.
 */
function generateWebhookSecret(): string {
  return randomBytes(32).toString('base64url');
}

function lastFourOf(plaintext: string): string {
  return plaintext.slice(-4);
}

/**
 * Decrypt a route's encrypted secret to plaintext (used as HMAC key).
 *
 * Returns null when the route has no secret at all (legacy null column,
 * or a route that never had one configured).
 *
 * Throws if the encrypted value is present but cannot be decrypted —
 * this indicates a key rotation issue or data corruption and must
 * surface, not silently fail open.
 */
function decryptRouteSecretOrThrow(encrypted: string | null): string | null {
  if (encrypted === null || encrypted === undefined) return null;
  return decryptSecret(encrypted);
}

/**
 * WebhookRoute with the plaintext secret field populated for callers
 * that need it (e.g. HMAC verification in handler.ts).
 *
 * `secret` here is the DECRYPTED value — never persist it.
 * For new code, prefer reading `secretEncrypted` and decrypting
 * explicitly at the call site.
 */
export type WebhookRouteWithSecret = WebhookRoute & {
  secret: string | null;
};

export function createWebhookStore(db: Database) {
  async function createRoute(input: {
    agentId: string;
    name: string;
  }): Promise<{ route: WebhookRoute; plaintextSecret: string }> {
    const now = Date.now();
    const plaintextSecret = generateWebhookSecret();
    const secretEncrypted = encryptSecret(plaintextSecret);
    const secretLastFour = lastFourOf(plaintextSecret);
    const route = {
      routeId: createId(),
      agentId: input.agentId,
      name: input.name,
      // Legacy column left null on new creates — backfill window only.
      secret: null,
      secretEncrypted,
      secretLastFour,
      isActive: 1,
      createdAt: now,
      updatedAt: now,
    };
    await withDbErrorLogging({
      scope: 'webhooks-store',
      op: 'createRoute',
      verb: 'write',
      context: { agentId: input.agentId },
      fn: () => db.insert(webhookRoutes).values(route as NewWebhookRoute),
    });
    return { route: route as WebhookRoute, plaintextSecret };
  }

  async function getRoute(routeId: string): Promise<WebhookRouteWithSecret | null> {
    return await withDbErrorLogging({
      scope: 'webhooks-store',
      op: 'getRoute',
      verb: 'read',
      context: { routeId },
      fn: async () => {
        const rows = await db
          .select()
          .from(webhookRoutes)
          .where(eq(webhookRoutes.routeId, routeId))
          .limit(1)
          .all();
        const route = (rows as WebhookRoute[])[0];
        if (route === undefined) return null;

        // Path A: new encrypted column populated → decrypt normally.
        if (route.secretEncrypted !== null && route.secretEncrypted !== undefined) {
          return {
            ...route,
            secret: decryptRouteSecretOrThrow(route.secretEncrypted),
          };
        }

        // Path B: legacy plain-text secret exists (pre-#5894 row) →
        // lazy backfill. Encrypt and update on first read so subsequent
        // reads use Path A. Original plaintext is returned to caller
        // for THIS read only.
        if (route.secret !== null && route.secret !== undefined && route.secret !== '') {
          const encrypted = encryptSecret(route.secret);
          const lastFour = lastFourOf(route.secret);
          await db
            .update(webhookRoutes)
            .set({
              secretEncrypted: encrypted,
              secretLastFour: lastFour,
              updatedAt: Date.now(),
            })
            .where(eq(webhookRoutes.routeId, routeId));
          return {
            ...route,
            secretEncrypted: encrypted,
            secretLastFour: lastFour,
            secret: route.secret,
          };
        }

        // No secret configured on this route at all.
        return { ...route, secret: null };
      },
    });
  }

  async function listRoutesByAgent(agentId: string): Promise<WebhookRoute[]> {
    return await withDbErrorLogging({
      scope: 'webhooks-store',
      op: 'listRoutesByAgent',
      verb: 'read',
      context: { agentId },
      fn: async () =>
        (await db
          .select()
          .from(webhookRoutes)
          .where(eq(webhookRoutes.agentId, agentId))
          .orderBy(desc(webhookRoutes.createdAt))
          .all()) as WebhookRoute[],
    });
  }

  async function deactivateRoute(routeId: string): Promise<void> {
    await withDbErrorLogging({
      scope: 'webhooks-store',
      op: 'deactivateRoute',
      verb: 'write',
      context: { routeId },
      fn: () =>
        db.update(webhookRoutes)
          .set({ isActive: 0, updatedAt: Date.now() })
          .where(eq(webhookRoutes.routeId, routeId)),
    });
  }

  /**
   * Generate a new 32-byte secret for an existing route, encrypt it,
   * and return the new plaintext secret one-time to the caller.
   *
   * Updates: secret_encrypted, secret_last_four, updated_at.
   * Does NOT touch the legacy `secret` column (stays null on rotated rows).
   *
   * Caller (admin route) MUST surface the plaintextSecret ONCE to the
   * admin and never store it server-side.
   */
  async function rotateRouteSecret(routeId: string): Promise<{ route: WebhookRoute; plaintextSecret: string }> {
    const plaintextSecret = generateWebhookSecret();
    const secretEncrypted = encryptSecret(plaintextSecret);
    const secretLastFour = lastFourOf(plaintextSecret);

    const updated = await withDbErrorLogging({
      scope: 'webhooks-store',
      op: 'rotateRouteSecret',
      verb: 'write',
      context: { routeId },
      fn: async () =>
        (await db
          .update(webhookRoutes)
          .set({
            secretEncrypted,
            secretLastFour,
            updatedAt: Date.now(),
          })
          .where(eq(webhookRoutes.routeId, routeId))
          .returning()) as unknown as WebhookRoute[],
    });

    if (updated.length === 0) {
      throw new Error(`Cannot rotate secret: route ${routeId} not found`);
    }
    return { route: updated[0], plaintextSecret };
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

    const eventContext = { routeId: input.routeId, agentId: input.agentId };

    // AC-3: no idempotencyKey (or empty string) → no dedup, original behavior.
    // (T4, T9: missing/empty key MUST behave as today.)
    if (input.idempotencyKey == null || input.idempotencyKey === '') {
      await withDbErrorLogging({
        scope: 'webhooks-store',
        op: 'createEvent',
        verb: 'write',
        context: eventContext,
        fn: () => db.insert(webhookEvents).values(event as NewWebhookEvent),
      });
      return { kind: 'created', eventId: event.eventId };
    }

    // AC-1, AC-2, AC-4: idempotencyKey present.
    //   - AC-2: scoped per route (composite unique on (routeId, idempotencyKey))
    //   - AC-4: atomic INSERT OR IGNORE → 10 parallel requests converge to 1 row
    const insertedRows = await withDbErrorLogging({
      scope: 'webhooks-store',
      op: 'createEvent',
      verb: 'write',
      context: eventContext,
      fn: async () =>
        (await db
          .insert(webhookEvents)
          .values(event as NewWebhookEvent)
          .onConflictDoNothing({
            target: [webhookEvents.routeId, webhookEvents.idempotencyKey],
            where: sql`${webhookEvents.idempotencyKey} IS NOT NULL`,
          })
          .returning({ eventId: webhookEvents.eventId })) as unknown as Array<{ eventId: string }>,
    });

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
      .all()) as unknown as Array<{ eventId: string }>;

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
    return await withDbErrorLogging({
      scope: 'webhooks-store',
      op: 'listEventsByAgent',
      verb: 'read',
      context: { agentId },
      fn: async () =>
        (await db
          .select()
          .from(webhookEvents)
          .where(eq(webhookEvents.agentId, agentId))
          .orderBy(desc(webhookEvents.receivedAt))
          .limit(limit)
          .all()) as WebhookEvent[],
    });
  }

  async function markProcessed(eventId: string): Promise<void> {
    await withDbErrorLogging({
      scope: 'webhooks-store',
      op: 'markProcessed',
      verb: 'write',
      context: { eventId },
      fn: () =>
        db.update(webhookEvents)
          .set({ status: 'processed', processedAt: Date.now() })
          .where(eq(webhookEvents.eventId, eventId)),
    });
  }

  async function markFailed(eventId: string): Promise<void> {
    await withDbErrorLogging({
      scope: 'webhooks-store',
      op: 'markFailed',
      verb: 'write',
      context: { eventId },
      fn: () =>
        db.update(webhookEvents)
          .set({ status: 'failed', processedAt: Date.now() })
          .where(eq(webhookEvents.eventId, eventId)),
    });
  }

  return {
    createRoute,
    getRoute,
    listRoutesByAgent,
    deactivateRoute,
    rotateRouteSecret,
    createEvent,
    listEventsByAgent,
    markProcessed,
    markFailed,
  };
}
