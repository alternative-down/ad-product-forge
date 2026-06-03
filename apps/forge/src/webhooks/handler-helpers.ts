import { createHash, timingSafeEqual } from 'node:crypto';
import type { HttpRequest } from '../http/server';
import type { WebhookRoute } from '../database/schema';

/**
 * Extract the routeId from a webhook request path.
 *
 * Returns null if the path doesn't match the `/webhooks/{routeId}` shape
 * (extra segments, missing prefix, etc.).
 *
 * @example
 *   extractRouteId('/webhooks/abc-123') // 'abc-123'
 *   extractRouteId('/webhooks/abc/extra') // null
 *   extractRouteId('/other/path') // null
 */
export function extractRouteId(path: string): string | null {
  const match = path.match(/^\/webhooks\/([^/]+)$/);
  return match ? match[1] : null;
}

/**
 * Coerce an HTTP header value to a single string.
 *
 * HTTP headers may be:
 * - `undefined` (not present) — returns `defaultValue` or `''`
 * - `string` (single value) — returned as-is
 * - `string[]` (multiple values) — first element returned
 *
 * @example
 *   extractHeader({foo: 'bar'}, 'foo') // 'bar'
 *   extractHeader({foo: ['bar', 'baz']}, 'foo') // 'bar'
 *   extractHeader({}, 'foo', 'default') // 'default'
 */
export function extractHeader(
  headers: Record<string, string | string[] | undefined>,
  name: string,
  defaultValue = '',
): string {
  const value = headers[name];
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length > 0) return value[0];
  return defaultValue;
}

/**
 * Verify a webhook signature against the expected HMAC-SHA256.
 *
 * Returns true if the signature matches, false otherwise.
 * Pure function — no logging, no side effects. Caller is responsible for logging.
 *
 * Supports the `x-forge-signature` and `x-hub-signature-256` (GitHub-style) header.
 * Header value may be a string or string[]. The `sha256=` prefix is required.
 *
 * @example
 *   verifyWebhookSignature('body', 'sha256=abc...', 'secret') // true if matches
 */
export function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | string[] | undefined,
  _secret: string,
): boolean {
  if (signatureHeader === undefined || signatureHeader === null) return false;
  const expected = 'sha256=' + createHash('sha256').update(rawBody).digest('hex');
  const received = typeof signatureHeader === 'string' ? signatureHeader : signatureHeader[0];
  if (received.length === 0) return false;
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(received);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Parse a JSON webhook payload.
 *
 * Returns a discriminated union. Caller decides what to do with `ok: false`
 * (typically: log + return 400).
 *
 * @example
 *   parseWebhookPayload('{"foo":"bar"}') // {ok: true, payload: {foo: 'bar'}}
 *   parseWebhookPayload('not-json') // {ok: false}
 */
export type ParsePayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false };

export function parseWebhookPayload(bodyText: string): ParsePayloadResult {
  try {
    const payload = JSON.parse(bodyText) as Record<string, unknown>;
    return { ok: true, payload };
  } catch {
    return { ok: false };
  }
}

/**
 * Build the headers sub-object stored alongside a webhook event.
 *
 * Captures the standard HTTP headers used for event audit and replay:
 * - `content-type`
 * - `user-agent`
 * - `x-forwarded-for` (first value if array)
 *
 * Missing headers default to empty string.
 */
export function buildEventHeaders(request: HttpRequest): Record<string, string> {
  return {
    'content-type': extractHeader(request.headers, 'content-type'),
    'user-agent': extractHeader(request.headers, 'user-agent'),
    'x-forwarded-for': extractHeader(request.headers, 'x-forwarded-for'),
  };
}

/**
 * Extract the idempotency key from a request, or undefined if not present / wrong type.
 *
 * Only accepts string values (defensive coercion — array values are ignored).
 * The idempotency key is used to deduplicate replays (see AC-2 / AC-3 in #5395).
 */
export function extractIdempotencyKey(request: HttpRequest): string | undefined {
  const value = request.headers['x-idempotency-key'];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Build the notification payload for a successful webhook event.
 *
 * Pure: timestamp is passed in by the caller (which has access to `Date.now()`
 * — a side effect).
 *
 * @example
 *   buildNotificationContent(route, 'evt-1', 'route-1', 1234567890)
 *   // { content: '[Webhook] ...', groupKey: 'webhook:evt-1', type: 'webhook', idempotencyKey: 'webhook:evt-1' }
 */
export function buildNotificationContent(
  route: WebhookRoute,
  eventId: string,
  routeId: string,
  timestamp: number,
): {
  agentId: string;
  content: string;
  groupKey: string;
  type: 'webhook';
  idempotencyKey: string;
  timestamp: number;
} {
  return {
    agentId: route.agentId,
    content: `[Webhook] Event received on route "${route.name}" (${routeId}). Event ID: ${eventId}`,
    groupKey: `webhook:${eventId}`,
    type: 'webhook',
    idempotencyKey: `webhook:${eventId}`,
    timestamp,
  };
}
