/**
 * Typed HTTP status codes + webhook body constants (Pattern L analog for HTTP responses).
 *
 * Replaces 9 magic HTTP status numbers + 7 magic body strings in
 * `apps/forge/src/webhooks/handler.ts` with named constants so consumers
 * can reference `HttpStatus.NotFound` instead of `404` and eliminate
 * the risk of typos like `410 vs 420`.
 *
 * Pattern reference: apps/forge/src/schedules/errors.ts (Pattern L, D49
 * #6522), apps/forge/src/capabilities/role-errors.ts (Pattern I, D45).
 *
 * Module-level constants (not a TypeScript enum) for tree-shakability —
 * only the constants actually referenced by handler.ts end up in the
 * bundle. The `HttpStatusCode` union type provides the same type-safety
 * benefits as a `enum`.
 *
 * Scope: webhook handler module only in this PR. Other modules still use
 * raw status numbers — expanding this to a shared utility is left as a
 * follow-up (see PR body for rationale).
 */

export const HttpStatus = {
  Ok: 200,
  Accepted: 202,
  BadRequest: 400,
  Unauthorized: 401,
  NotFound: 404,
  InternalServerError: 500,
} as const;

export type HttpStatusCode = (typeof HttpStatus)[keyof typeof HttpStatus];

/**
 * Webhook-specific body message constants. Used by handler.ts to ensure
 * consistent error messages across the 5 error paths and to eliminate
 * the "Route not found" 2x duplicate (handler.ts:45 + :50).
 *
 * Plain text (NOT JSON) for backward compatibility with handler.test.ts
 * which asserts exact body string content (e.g., `result.body === 'Missing signature'`).
 */
export const WebhookBody = {
  RouteNotFound: 'Route not found',
  RouteInactive: 'Route inactive',
  RouteMisconfigured: 'Route misconfigured',
  MissingSignature: 'Missing signature',
  InvalidSignature: 'Invalid signature',
  InvalidJsonPayload: 'Invalid JSON payload',
} as const;

export type WebhookBodyKey = keyof typeof WebhookBody;
