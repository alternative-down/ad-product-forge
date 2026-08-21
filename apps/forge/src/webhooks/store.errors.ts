/**
 * Typed Error subclasses for the webhooks/store module (Pattern L, D51 #6502 batch 21).
 *
 * Replaces 2 raw `throw new Error(...)` calls in webhooks/store.ts with 2 typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/webhooks/store.ts collapse to 2 typed Error classes.
 * Message format is preserved verbatim for backward compatibility with
 * existing `.rejects.toThrow(<substring>)` and `.rejects.toThrow(/<regex>/)`
 * tests in store.test.ts.
 *
 * Pattern reference: apps/forge/src/coolify/helpers.errors.ts (D51 batch 20 — Varek),
 * apps/forge/src/admin/routes/helpers.errors.ts (D51 batch 19 — Varek).
 */

export class WebhookRouteSecretRotationRouteNotFoundError extends Error {
  readonly code = 'WEBHOOK_ROUTE_SECRET_ROTATION_ROUTE_NOT_FOUND' as const;
  readonly routeId: string;
  constructor(routeId: string) {
    super(`Cannot rotate secret: route ${routeId} not found`);
    this.name = 'WebhookRouteSecretRotationRouteNotFoundError';
    this.routeId = routeId;
  }
}

export class WebhookIdempotencyConflictNoExistingEventError extends Error {
  readonly code = 'WEBHOOK_IDEMPOTENCY_CONFLICT_NO_EXISTING_EVENT' as const;
  readonly routeId: string;
  readonly idempotencyKey: string;
  constructor(routeId: string, idempotencyKey: string) {
    super(
      `Idempotency conflict but no existing event found for route=${routeId} key=${idempotencyKey}`,
    );
    this.name = 'WebhookIdempotencyConflictNoExistingEventError';
    this.routeId = routeId;
    this.idempotencyKey = idempotencyKey;
  }
}
