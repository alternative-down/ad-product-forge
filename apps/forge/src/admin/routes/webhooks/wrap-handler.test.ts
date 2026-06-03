import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { wrapAdminRoute } from './wrap-handler';
import type { HttpRequest, HttpResponse } from '../../../http/server';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

vi.mock('../index', () => ({
  jsonResponse: (body: unknown, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  }),
}));

vi.mock('../../../agents/error-formatting', () => ({
  errorMsg: (err: unknown) =>
    err instanceof Error ? err.message : typeof err === 'string' ? err : JSON.stringify(err),
}));

import { forgeDebug } from '@forge-runtime/core';

const ROUTE_PATH = '/admin/test/route';
const REQUEST = {
  method: 'GET',
  path: '/admin/test/route',
  bodyText: '',
  headers: {},
  query: new URLSearchParams(),
} as unknown as HttpRequest;

beforeEach(() => {
  vi.mocked(forgeDebug).mockReset();
});

describe('wrapAdminRoute', () => {
  it('returns the handler result on success', async () => {
    const expected: HttpResponse = { status: 200, body: 'ok', headers: {} };
    const wrapped = wrapAdminRoute(ROUTE_PATH, async () => expected);
    const result = await wrapped(REQUEST);
    expect(result).toEqual(expected);
    expect(forgeDebug).not.toHaveBeenCalled();
  });

  it('logs and returns 500 for generic errors', async () => {
    const wrapped = wrapAdminRoute(ROUTE_PATH, async () => {
      throw new Error('boom');
    });
    const result = await wrapped(REQUEST);
    expect(result.status).toBe(500);
    expect(JSON.parse(result.body as string)).toEqual({ error: 'boom' });
    expect(forgeDebug).toHaveBeenCalledWith({
      scope: 'admin',
      level: 'error',
      message: `Admin route failed: ${ROUTE_PATH}`,
      context: { error: 'boom' },
    });
  });

  it('returns 400 with validation_failed for ZodError', async () => {
    const wrapped = wrapAdminRoute(ROUTE_PATH, async () => {
      throw new ZodError([
        { code: 'invalid_type', expected: 'string', received: 'undefined', path: ['agentId'], message: 'Required' },
      ]);
    });
    const result = await wrapped(REQUEST);
    expect(result.status).toBe(400);
    const parsed = JSON.parse(result.body as string);
    expect(parsed.error).toBe('validation_failed');
    expect(parsed.details).toBeDefined();
    expect(Array.isArray(parsed.details)).toBe(true);
    expect(forgeDebug).toHaveBeenCalled();
  });

  it('logs the route path in the error message', async () => {
    const customPath = '/admin/custom/endpoint';
    const wrapped = wrapAdminRoute(customPath, async () => {
      throw new Error('failure');
    });
    await wrapped(REQUEST);
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        message: `Admin route failed: ${customPath}`,
      }),
    );
  });

  it('handles non-Error throws (e.g. string)', async () => {
    const wrapped = wrapAdminRoute(ROUTE_PATH, async () => {
      throw 'string-error';
    });
    const result = await wrapped(REQUEST);
    expect(result.status).toBe(500);
    expect(JSON.parse(result.body as string)).toEqual({ error: 'string-error' });
  });
});
