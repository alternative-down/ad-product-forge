import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  withRouteErrorHandler,
  getQueryParam,
  requireQueryParam,
  parseBody,
} from './internal-chat-route-helpers';
import type { InternalChatRequest } from './internal-chat-route-helpers';
import { parseJsonBody } from '../index';

// ─── Mock setup ──────────────────────────────────────────────────────────────

const mockForgeDebug = vi.fn();
vi.mock('../debug', () => ({
  forgeDebug: (...args: unknown[]) => mockForgeDebug(...args),
}));

// ─── InternalChatRequest factory ─────────────────────────────────────────────

function makeRequest(overrides: Partial<InternalChatRequest> = {}): InternalChatRequest {
  return {
    query: new Map(),
    bodyText: '',
    ...overrides,
  };
}

// ─── withRouteErrorHandler tests ─────────────────────────────────────────────

describe('withRouteErrorHandler', () => {
  beforeEach(() => mockForgeDebug.mockClear());

  it('returns the handler result on success', () => {
    const mockResponse = { status: 200, body: 'ok' };
    const wrapped = withRouteErrorHandler('admin', '/test', () => mockResponse);
    expect(wrapped()).toEqual(mockResponse);
    expect(mockForgeDebug).not.toHaveBeenCalled();
  });

  it('logs and returns 500 on Error thrown', () => {
    const wrapped = withRouteErrorHandler('admin', '/test', () => {
      throw new Error('something went wrong');
    });
    const result = wrapped() as { status: number; body: string };
    expect(result.status).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'something went wrong' });
    expect(mockForgeDebug).toHaveBeenCalledOnce();
    const [arg] = mockForgeDebug.mock.calls[0] as [unknown];
    expect((arg as { scope: string }).scope).toEqual('admin');
  });

  it('converts non-Error thrown values to string', () => {
    const wrapped = withRouteErrorHandler('admin', '/test', () => {
      // eslint-disable-next-line @typescript-eslint/no-throw-literals
      throw 'string error';
    });
    const result = wrapped() as { status: number; body: string };
    expect(result.status).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'string error' });
  });

  it('logs the correct path in the error message', () => {
    const wrapped = withRouteErrorHandler('admin', '/admin/internal-chat/accounts', () => {
      throw new Error('db failed');
    });
    wrapped();
    const debugCall = mockForgeDebug.mock.calls[0][0] as { message: string };
    expect(debugCall.message).toBe('Admin route failed: /admin/internal-chat/accounts');
  });
});

// ─── getQueryParam tests ─────────────────────────────────────────────────────

describe('getQueryParam', () => {
  it('returns the value when the key exists and is non-empty', () => {
    const request = makeRequest({ query: new Map([['accountId', 'acc-001']]) });
    expect(getQueryParam(request, 'accountId')).toBe('acc-001');
  });

  it('returns null when the key is missing', () => {
    const request = makeRequest({ query: new Map() });
    expect(getQueryParam(request, 'accountId')).toBeNull();
  });

  it('returns null when the value is empty string', () => {
    const request = makeRequest({ query: new Map([['accountId', '']]) });
    expect(getQueryParam(request, 'accountId')).toBeNull();
  });

});

// ─── requireQueryParam tests ────────────────────────────────────────────────

describe('requireQueryParam', () => {
  it('returns the value when the key exists and is non-empty', () => {
    const request = makeRequest({ query: new Map([['accountId', 'acc-001']]) });
    expect(requireQueryParam(request, 'accountId')).toBe('acc-001');
  });

  it('throws when the key is missing', () => {
    const request = makeRequest({ query: new Map() });
    expect(() => requireQueryParam(request, 'accountId')).toThrow('accountId required');
  });

  it('throws when the value is empty string', () => {
    const request = makeRequest({ query: new Map([['accountId', '']]) });
    expect(() => requireQueryParam(request, 'accountId')).toThrow('accountId required');
  });
});

// ─── parseBody tests ─────────────────────────────────────────────────────────

describe('parseBody', () => {
  it('parses valid JSON matching the schema', () => {
    const schema = z.object({ targetKey: z.string() });
    const request = makeRequest({ bodyText: JSON.stringify({ targetKey: 'alice' }) });
    const result = parseBody(request, schema);
    expect(result).toEqual({ targetKey: 'alice' });
  });

  it('re-throws on JSON.parse failure', () => {
    const schema = z.object({ targetKey: z.string() });
    const request = makeRequest({ bodyText: 'not json' });
    expect(() => parseBody(request, schema)).toThrow();
  });

  it('re-throws on Zod validation failure', () => {
    const schema = z.object({ targetKey: z.string() });
    const request = makeRequest({ bodyText: JSON.stringify({ targetKey: 123 }) });
    expect(() => parseBody(request, schema)).toThrow();
  });
});
