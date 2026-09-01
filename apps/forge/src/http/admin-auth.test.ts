/**
 * Tests for the shared admin API key header constant.
 *
 * Issue #6673 — CORS_ALLOWED_HEADERS duplicated the `x-forge-admin-api-key`
 * string literal. The fix exports `ADMIN_API_KEY_HEADER` as the single source
 * of truth so server.ts CORS preflight and admin-auth logic cannot drift.
 *
 * These tests guard against drift:
 *  1. The constant is the canonical header name.
 *  2. The CORS preflight allow-headers actually contains it.
 *
 * Scope: apps/forge/src/http/admin-auth.ts + apps/forge/src/http/server.ts
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import http from 'node:http';

import { ADMIN_API_KEY_HEADER, type AdminAuthError, verifyAdminApiKey } from './admin-auth.js';
import { createForgeHttpServer, type ForgeHttpServer } from './server.js';

let server: ForgeHttpServer;
let testPort = 0;

beforeEach(async () => {
  testPort = 30000 + Math.floor(Math.random() * 20000);
  server = createForgeHttpServer({ port: testPort });
  await server.start();
});

afterEach(async () => {
  await server.stop();
});

async function makeRawRequest(
  method: string,
  path: string,
  headers?: Record<string, string>,
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: 'localhost',
        port: testPort,
        path,
        method,
        headers: { 'content-type': 'application/json', ...headers },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: data,
          });
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('ADMIN_API_KEY_HEADER (#6673)', () => {
  it('is exported with the canonical header name', () => {
    expect(ADMIN_API_KEY_HEADER).toBe('x-forge-admin-api-key');
  });

  it('contains the admin API key header in CORS allow-headers', async () => {
    server.registerRoute({
      method: 'GET',
      path: '/cors-tripwire',
      handler: async () => ({ status: 200, body: 'ok' }),
    });

    const res = await makeRawRequest('GET', '/cors-tripwire');
    const allowHeaders = res.headers['access-control-allow-headers'];
    expect(allowHeaders).toBeDefined();
    // The tripwire: any future header rename must update both files.
    expect(allowHeaders).toContain(ADMIN_API_KEY_HEADER);
    expect(allowHeaders).toContain('content-type');
  });
});

describe('verifyAdminApiKey (#6673, ref #6528)', () => {
  const fakeHeaders = (record: Record<string, string>): http.IncomingHttpHeaders =>
    record as unknown as http.IncomingHttpHeaders;

  it('returns null when API key matches', () => {
    const result: AdminAuthError | null = verifyAdminApiKey(
      fakeHeaders({ [ADMIN_API_KEY_HEADER]: 'secret' }),
      'secret',
      false,
    );
    expect(result).toBeNull();
  });

  it('returns 401 when API key does not match', () => {
    const result = verifyAdminApiKey(
      fakeHeaders({ [ADMIN_API_KEY_HEADER]: 'wrong' }),
      'secret',
      false,
    );
    expect(result).toEqual({
      status: 401,
      body: { error: 'Invalid admin API key' },
    });
  });

  it('returns 503 when API key is undefined and insecure local is disallowed', () => {
    const result = verifyAdminApiKey(fakeHeaders({}), undefined, false);
    expect(result?.status).toBe(503);
  });

  it('returns null when API key is undefined and insecure local is allowed', () => {
    const result = verifyAdminApiKey(fakeHeaders({}), undefined, true);
    expect(result).toBeNull();
  });
});
