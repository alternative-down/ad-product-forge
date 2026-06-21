import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import {
  extractRouteId,
  extractHeader,
  verifyWebhookSignature,
  parseWebhookPayload,
  buildEventHeaders,
  extractIdempotencyKey,
  buildNotificationContent,
} from './handler-helpers';
import type { HttpRequest } from '../http/server';
import type { WebhookRoute } from '../database/schema';

describe('extractRouteId', () => {
  it('extracts routeId from valid /webhooks/{id} path', () => {
    expect(extractRouteId('/webhooks/abc-123')).toBe('abc-123');
  });

  it('extracts UUID routeId', () => {
    expect(extractRouteId('/webhooks/a1b2c3d4-e5f6-7890-abcd-ef1234567890')).toBe(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
  });

  it('returns null when path has extra segments', () => {
    expect(extractRouteId('/webhooks/abc/extra')).toBeNull();
  });

  it('returns null when path is missing the prefix', () => {
    expect(extractRouteId('/other/abc')).toBeNull();
  });

  it('returns null for empty path', () => {
    expect(extractRouteId('')).toBeNull();
  });

  it('returns null for path with no routeId segment', () => {
    expect(extractRouteId('/webhooks/')).toBeNull();
  });
});

describe('extractHeader', () => {
  it('returns string value when header is a string', () => {
    expect(extractHeader({ foo: 'bar' }, 'foo')).toBe('bar');
  });

  it('returns first element when header is an array', () => {
    expect(extractHeader({ foo: ['bar', 'baz'] }, 'foo')).toBe('bar');
  });

  it('returns default value when header is missing', () => {
    expect(extractHeader({}, 'foo')).toBe('');
  });

  it('returns custom default value when header is missing', () => {
    expect(extractHeader({}, 'foo', 'default')).toBe('default');
  });

  it('returns default when header is empty array', () => {
    expect(extractHeader({ foo: [] }, 'foo', 'fallback')).toBe('fallback');
  });

  it('handles null header value as missing', () => {
    expect(extractHeader({ foo: null as any }, 'foo')).toBe('');
  });
});

describe('verifyWebhookSignature', () => {
  const body = '{"event":"test"}';
  const secret = 'my-secret';

  function sign(rawBody: string, key: string): string {
    return 'sha256=' + createHmac('sha256', key).update(rawBody).digest('hex');
  }

  function signWith(rawBody: string, key: string): string {
    return createHmac('sha256', key).update(rawBody).digest('hex');
  }

  it('returns true for valid signature', () => {
    const signature = sign(body, secret);
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    expect(verifyWebhookSignature(body, 'sha256=deadbeef', secret)).toBe(false);
  });

  it('returns false when signature header is missing', () => {
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
  });

  it('returns false when signature is array of empty strings', () => {
    expect(verifyWebhookSignature(body, [''], secret)).toBe(false);
  });

  it('accepts string[] header (uses first element)', () => {
    const signature = sign(body, secret);
    expect(verifyWebhookSignature(body, [signature, 'extra'], secret)).toBe(true);
  });

  it('uses HMAC-SHA256 with the secret (not plain SHA-256)', () => {
    const bodyText = '{"a":1,"b":2}';
    const signature = sign(bodyText, secret);
    // Signature must be computed with the secret. A signature computed
    // with a different secret must NOT verify, and a signature verified
    // against a different secret must NOT match.
    expect(verifyWebhookSignature(bodyText, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(bodyText, signature, 'wrong-secret')).toBe(false);
    expect(verifyWebhookSignature(bodyText, sign(bodyText, 'wrong-secret'), secret)).toBe(false);
  });

  it('returns false when secret differs', () => {
    const signature = sign(body, secret);
    expect(verifyWebhookSignature(body, signature, 'different-secret')).toBe(false);
  });

  it('security regression: forged signature with different secret is rejected', () => {
    // Regression test for the P0 #5870 bypass: previously, any signature
    // matching sha256(body) would verify, regardless of the secret.
    // Compute a forged signature using a wrong secret — it must NOT verify
    // against the route's real secret.
    const forgedSig = sign(body, 'attacker-guessed-secret');
    expect(verifyWebhookSignature(body, forgedSig, secret)).toBe(false);
  });

  it('returns false on crypto edge case (Buffer length mismatch)', () => {
    // Wrong length signature: e.g., truncated
    expect(verifyWebhookSignature(body, 'sha256=abc', secret)).toBe(false);
  });

  it('handles malformed base16 in signature gracefully (catches errors)', () => {
    // Non-hex chars may cause Buffer.from to behave unpredictably; the function
    // must not throw, must return false.
    expect(() => verifyWebhookSignature(body, 'sha256=zzzzz', secret)).not.toThrow();
    expect(verifyWebhookSignature(body, 'sha256=zzzzz', secret)).toBe(false);
  });
});

describe('parseWebhookPayload', () => {
  it('parses valid JSON object', () => {
    const result = parseWebhookPayload('{"foo":"bar"}');
    expect(result).toEqual({ ok: true, payload: { foo: 'bar' } });
  });

  it('parses JSON with nested objects', () => {
    const result = parseWebhookPayload('{"a":{"b":1}}');
    expect(result).toEqual({ ok: true, payload: { a: { b: 1 } } });
  });

  it('returns ok: false for invalid JSON', () => {
    expect(parseWebhookPayload('not json')).toEqual({ ok: false });
  });

  it('returns ok: false for empty string', () => {
    expect(parseWebhookPayload('')).toEqual({ ok: false });
  });

  it('returns ok: false for trailing garbage', () => {
    expect(parseWebhookPayload('{"a":1}garbage')).toEqual({ ok: false });
  });

  it('parses JSON arrays (passes through as object cast — caller responsible)', () => {
    // parseWebhookPayload types the result as `Record<string, unknown>`,
    // but JSON.parse is honest: if the top-level is an array, it's still
    // "ok: true" with the array as payload.
    const result = parseWebhookPayload('[1,2,3]');
    expect(result.ok).toBe(true);
  });
});

describe('buildEventHeaders', () => {
  function makeRequest(headers: Record<string, string | string[] | undefined>): HttpRequest {
    return {
      method: 'POST',
      path: '/webhooks/abc',
      query: new URLSearchParams(),
      headers: headers as any,
      body: Buffer.from('{}'),
      bodyText: '{}',
      req: {} as any,
    };
  }

  it('extracts standard headers', () => {
    const request = makeRequest({
      'content-type': 'application/json',
      'user-agent': 'GitHub-Hookshot/1.0',
      'x-forwarded-for': '192.0.2.1',
    });
    expect(buildEventHeaders(request)).toEqual({
      'content-type': 'application/json',
      'user-agent': 'GitHub-Hookshot/1.0',
      'x-forwarded-for': '192.0.2.1',
    });
  });

  it('uses empty string for missing headers', () => {
    expect(buildEventHeaders(makeRequest({}))).toEqual({
      'content-type': '',
      'user-agent': '',
      'x-forwarded-for': '',
    });
  });

  it('takes first element when x-forwarded-for is array', () => {
    const request = makeRequest({
      'x-forwarded-for': ['192.0.2.1, 10.0.0.1', '10.0.0.2'],
    });
    expect(buildEventHeaders(request)['x-forwarded-for']).toBe('192.0.2.1, 10.0.0.1');
  });
});

describe('extractIdempotencyKey', () => {
  function makeRequest(headers: Record<string, string | string[] | undefined>): HttpRequest {
    return {
      method: 'POST',
      path: '/webhooks/abc',
      query: new URLSearchParams(),
      headers: headers as any,
      body: Buffer.from('{}'),
      bodyText: '{}',
      req: {} as any,
    };
  }

  it('returns the string value when present', () => {
    expect(extractIdempotencyKey(makeRequest({ 'x-idempotency-key': 'idem-123' }))).toBe(
      'idem-123',
    );
  });

  it('returns undefined when header is missing', () => {
    expect(extractIdempotencyKey(makeRequest({}))).toBeUndefined();
  });

  it('returns undefined when header is an array (defensive: only strings accepted)', () => {
    expect(
      extractIdempotencyKey(makeRequest({ 'x-idempotency-key': ['a', 'b'] })),
    ).toBeUndefined();
  });

  it('returns undefined when header is empty string', () => {
    // Empty string is "typeof string" so it returns '' (preserves AC-3 / T9:
    // "empty key === missing" is a SEPARATE decision the store makes;
    // here we just extract verbatim).
    expect(extractIdempotencyKey(makeRequest({ 'x-idempotency-key': '' }))).toBe('');
  });
});

describe('buildNotificationContent', () => {
  const route: WebhookRoute = {
    routeId: 'route-1',
    agentId: 'agent-1',
    name: 'My Webhook',
    secret: null,
    isActive: 1,
    createdAt: 1000,
    updatedAt: 2000,
  };

  it('builds notification payload with route name + eventId', () => {
    const result = buildNotificationContent(route, 'evt-42', 'route-1', 1234567890);
    expect(result).toEqual({
      agentId: 'agent-1',
      content: '[Webhook] Event received on route "My Webhook" (route-1). Event ID: evt-42',
      groupKey: 'webhook:evt-42',
      type: 'webhook',
      idempotencyKey: 'webhook:evt-42',
      timestamp: 1234567890,
    });
  });

  it('uses eventId for groupKey and idempotencyKey (not routeId)', () => {
    const result = buildNotificationContent(route, 'different-evt', 'route-1', 0);
    expect(result.groupKey).toBe('webhook:different-evt');
    expect(result.idempotencyKey).toBe('webhook:different-evt');
  });

  it('preserves timestamp parameter verbatim (caller injects Date.now())', () => {
    const ts = 9999999;
    expect(buildNotificationContent(route, 'evt-1', 'route-1', ts).timestamp).toBe(ts);
  });

  it('handles route.name with special characters (template literal interpolation)', () => {
    const routeWithQuotes: WebhookRoute = {
      ...route,
      name: 'Name with "quotes" and \\backslashes',
    };
    const result = buildNotificationContent(routeWithQuotes, 'evt-1', 'route-1', 0);
    expect(result.content).toContain('Name with "quotes" and \\backslashes');
  });
});
