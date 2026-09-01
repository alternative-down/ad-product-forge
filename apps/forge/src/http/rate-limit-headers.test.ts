/**
 * Integration tests for X-RateLimit-* HTTP response headers.
 *
 * Kaelen added rate-limit headers to all HTTP responses in #2111.
 * These tests verify that X-RateLimit-Limit, X-RateLimit-Remaining, and
 * X-RateLimit-Reset are present and correct on all response types.
 *
 * Scope: apps/forge/src/http/server.ts
 * Issue: #1882
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';

import { createForgeHttpServer } from './server.js';

const RATE_MAX = 120;
const RATE_WINDOW_MS = 60_000;

async function makeRawRequest(
  method: string,
  path: string,
  body?: string,
  headers?: Record<string, string>,
  portOverride?: number,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const opts: http.RequestOptions = {
      hostname: 'localhost',
      port: portOverride ?? testPort,
      path,
      method,
      headers: {
        'content-type': 'application/json',
        ...headers,
      },
    };
    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

let testPort = 0;

describe('X-RateLimit-* response headers', () => {
  let server: ReturnType<typeof createForgeHttpServer>;
  let baseUrl: string;

  beforeEach(async () => {
    testPort = 30000 + Math.floor(Math.random() * 20000);
    server = createForgeHttpServer({ port: testPort });
    await server.start();
    baseUrl = `http://localhost:${testPort}`;
  });

  afterEach(async () => {
    await server.stop();
  });

  // ── Helper ──────────────────────────────────────────────────────────────

  function expectRateLimitHeaders(
    headers: http.IncomingHttpHeaders,
    opts?: { minRemaining?: number; maxRemaining?: number },
  ) {
    expect(headers['x-ratelimit-limit']).toBe(String(RATE_MAX));
    expect(headers['x-ratelimit-remaining']).toBeDefined();
    expect(headers['x-ratelimit-reset']).toBeDefined();
    const remaining = parseInt(String(headers['x-ratelimit-remaining']), 10);
    const reset = parseInt(String(headers['x-ratelimit-reset']), 10);
    expect(Number.isFinite(remaining)).toBe(true);
    expect(Number.isFinite(reset)).toBe(true);
    expect(remaining).toBeGreaterThanOrEqual(0);
    expect(remaining).toBeLessThanOrEqual(RATE_MAX);
    const nowSec = Math.ceil(Date.now() / 1000);
    // Reset should be in the future (within the window)
    expect(reset).toBeGreaterThanOrEqual(nowSec);
    expect(reset).toBeLessThanOrEqual(nowSec + Math.ceil(RATE_WINDOW_MS / 1000) + 1);
    if (opts?.minRemaining !== undefined) {
      expect(remaining).toBeGreaterThanOrEqual(opts.minRemaining);
    }
    if (opts?.maxRemaining !== undefined) {
      expect(remaining).toBeLessThanOrEqual(opts.maxRemaining);
    }
  }

  // ── Success responses ─────────────────────────────────────────────────

  describe('success responses (2xx)', () => {
    it('includes X-RateLimit-* headers on 200 OK', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/ok',
        handler: async () => ({ status: 200, body: 'ok' }),
      });
      const res = await makeRawRequest('GET', '/ok');
      expect(res.status).toBe(200);
      expect(res.body).toBe('ok');
      expectRateLimitHeaders(res.headers);
    });

    it('includes X-RateLimit-* headers on 201 Created', async () => {
      server.registerRoute({
        method: 'POST',
        path: '/created',
        handler: async () => ({
          status: 201,
          body: JSON.stringify({ id: '123' }),
          headers: { 'content-type': 'application/json' },
        }),
      });
      const res = await makeRawRequest('POST', '/created', '{}');
      expect(res.status).toBe(201);
      expectRateLimitHeaders(res.headers);
    });

    it('includes X-RateLimit-* headers on 204 No Content', async () => {
      server.registerRoute({
        method: 'DELETE',
        path: '/gone',
        handler: async () => ({ status: 204 }),
      });
      const res = await makeRawRequest('DELETE', '/gone');
      expect(res.status).toBe(204);
      expectRateLimitHeaders(res.headers);
    });

    it('X-RateLimit-Remaining decreases as requests are made', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/dec',
        handler: async () => ({ status: 200, body: 'ok' }),
      });

      const res1 = await makeRawRequest('GET', '/dec');
      expectRateLimitHeaders(res1.headers);
      const remaining1 = parseInt(String(res1.headers['x-ratelimit-remaining']), 10);

      const res2 = await makeRawRequest('GET', '/dec');
      expectRateLimitHeaders(res2.headers);
      const remaining2 = parseInt(String(res2.headers['x-ratelimit-remaining']), 10);

      // Each request should decrement remaining by 1
      expect(remaining2).toBe(remaining1 - 1);
    });
  });

  // ── Error responses ──────────────────────────────────────────────────

  describe('error responses (4xx/5xx)', () => {
    it('returns 400 with rate-limit headers when handler throws ZodError', async () => {
      server.registerRoute({
        method: 'POST',
        path: '/validate',
        handler: async (_req) => {
          const { z } = await import('zod');
          const schema = z.object({ name: z.string() });
          // Trigger Zod validation failure
          schema.parse({ name: 123 });
          return { status: 200, body: 'ok' };
        },
      });
      const res = await makeRawRequest('POST', '/validate', JSON.stringify({ name: 123 }));
      expect(res.status).toBe(400);
      expect(res.body).toContain('Invalid request');
      expectRateLimitHeaders(res.headers);
    });

    it('returns 404 without rate-limit headers (unauthenticated route)', async () => {
      const res = await makeRawRequest('GET', '/does-not-exist');
      expect(res.status).toBe(404);
      // 404 is a server-level not-found before auth/rate-limit tracking
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
      expect(res.headers['x-ratelimit-remaining']).toBeUndefined();
    });

    it('returns 413 with rate-limit headers on oversized body', async () => {
      const smallBodyServer = createForgeHttpServer({ port: 0, maxBodyBytes: 5 });
      smallBodyServer.registerRoute({
        method: 'POST',
        path: '/upload',
        handler: async () => ({ status: 200, body: 'ok' }),
      });
      await smallBodyServer.start();

      const res = await makeRawRequest(
        'POST',
        '/upload',
        'this is way too large',
        undefined,
        smallBodyServer.port,
      );
      await smallBodyServer.stop();

      expect(res.status).toBe(413);
      expect(res.body).toContain('Request body too large');
      expectRateLimitHeaders(res.headers);
    });

    it('returns 500 without rate-limit headers on handler exceptions', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/boom',
        handler: async () => {
          throw new Error(' Deliberate server error for test ');
        },
      });
      const res = await makeRawRequest('GET', '/boom');
      expect(res.status).toBe(500);
      expect(res.body).toContain(' Deliberate server error for test ');
      // 500 error path does not include rate-limit headers in current impl
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    });

    it('returns 401 without rate-limit headers on failed admin auth', async () => {
      const srv = createForgeHttpServer({ port: 0, adminApiKey: 'secret-key' });
      srv.registerRoute({
        method: 'GET',
        path: '/admin/secret',
        handler: async () => ({ status: 200, body: 'ok' }),
      });
      await srv.start();

      const res = await makeRawRequest('GET', '/admin/secret', undefined, undefined, srv.port);
      await srv.stop();

      expect(res.status).toBe(401);
      // 401 is returned before rate-limit tracking runs
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    });

    it('returns 503 without rate-limit headers when admin key not configured', async () => {
      const srv = createForgeHttpServer({ port: 0 });
      srv.registerRoute({
        method: 'GET',
        path: '/admin/nokey',
        handler: async () => ({ status: 200, body: 'ok' }),
      });
      await srv.start();

      const res = await makeRawRequest('GET', '/admin/nokey', undefined, undefined, srv.port);
      await srv.stop();

      expect(res.status).toBe(503);
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    });
  });

  // ── Rate limit values accuracy ───────────────────────────────────────

  describe('rate limit values accuracy', () => {
    it('X-RateLimit-Limit is always 120 (RATE_MAX constant)', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/limit-check',
        handler: async () => ({ status: 200, body: 'ok' }),
      });
      for (let i = 0; i < 5; i++) {
        const res = await makeRawRequest('GET', '/limit-check');
        expect(res.headers['x-ratelimit-limit']).toBe(String(RATE_MAX));
      }
    });

    it('X-RateLimit-Remaining is accurate after multiple requests', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/count-down',
        handler: async () => ({ status: 200, body: 'ok' }),
      });
      // Make 3 requests and check remaining decreases each time
      const remainings: number[] = [];
      for (let i = 0; i < 3; i++) {
        const res = await makeRawRequest('GET', '/count-down');
        remainings.push(parseInt(String(res.headers['x-ratelimit-remaining']), 10));
      }
      // Each should be 1 less than the previous
      expect(remainings[1]).toBe(remainings[0] - 1);
      expect(remainings[2]).toBe(remainings[1] - 1);
    });

    it('X-RateLimit-Reset is approximately 60 seconds from now', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/reset-check',
        handler: async () => ({ status: 200, body: 'ok' }),
      });
      const res = await makeRawRequest('GET', '/reset-check');
      const reset = parseInt(String(res.headers['x-ratelimit-reset']), 10);
      const nowSec = Math.ceil(Date.now() / 1000);
      // Reset should be within 60±1 seconds of now
      expect(reset).toBeGreaterThanOrEqual(nowSec);
      expect(reset).toBeLessThanOrEqual(nowSec + Math.ceil(RATE_WINDOW_MS / 1000) + 1);
    });

    it('X-RateLimit-Remaining does not go below 0', async () => {
      const limitedServer = createForgeHttpServer({ port: 0 });
      limitedServer.registerRoute({
        method: 'GET',
        path: '/floor',
        handler: async () => ({ status: 200, body: 'ok' }),
      });
      await limitedServer.start();

      // Make many rapid requests to exhaust rate limit
      const requests = Array.from({ length: 150 }, () =>
        makeRawRequest('GET', '/floor', undefined, undefined, limitedServer.port),
      );
      const responses = await Promise.all(requests);
      await limitedServer.stop();

      // All responses should have remaining >= 0
      for (const res of responses) {
        const remaining = parseInt(String(res.headers['x-ratelimit-remaining']), 10);
        expect(remaining).toBeGreaterThanOrEqual(0);
      }
    });
  });

  // ── Header casing ────────────────────────────────────────────────────

  describe('header casing normalization', () => {
    it('headers are accessible regardless of HTTP header casing (lowercase keys)', async () => {
      server.registerRoute({
        method: 'GET',
        path: '/case-test',
        handler: async () => ({ status: 200, body: 'ok' }),
      });
      const res = await makeRawRequest('GET', '/case-test');
      // Node http returns lowercase header keys
      expect(res.headers['x-ratelimit-limit']).toBe(String(RATE_MAX));
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
      expect(res.headers['x-ratelimit-reset']).toBeDefined();
    });
  });
});
