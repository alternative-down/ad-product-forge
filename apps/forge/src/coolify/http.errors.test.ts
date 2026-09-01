import { describe, expect, test } from 'vitest';
import { CoolifyHttpRequestError } from './errors';

// ── Pattern L D52 #6502 batch coolify/http: typed-Error class tests ──
// Unit tests for coolify/http.ts throw-site replacement.
// Message strings preserved verbatim for backward compatibility with
// http.test.ts string-based assertions (rejects.toThrow('404') etc.).

describe('CoolifyHttpRequestError', () => {
  test('preserves HTTP method, path, status, and body', () => {
    const err = new CoolifyHttpRequestError('GET', '/servers/uuid', 404, 'Not found');
    expect(err.name).toBe('CoolifyHttpRequestError');
    expect(err.code).toBe('COOLIFY_HTTP_REQUEST');
    expect(err.method).toBe('GET');
    expect(err.path).toBe('/servers/uuid');
    expect(err.status).toBe(404);
    expect(err.body).toBe('Not found');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CoolifyHttpRequestError);
  });

  test('preserves verbatim buildRequestError message for HTTP 404', () => {
    const err = new CoolifyHttpRequestError('GET', '/servers/uuid', 404, 'Not found');
    expect(err.message).toBe('Coolify API GET /servers/uuid failed with 404: Not found');
  });

  test('preserves verbatim message for JSON body error response', () => {
    const err = new CoolifyHttpRequestError('POST', '/apps', 500, { error: 'internal error' });
    expect(err.method).toBe('POST');
    expect(err.path).toBe('/apps');
    expect(err.status).toBe(500);
    expect(err.body).toEqual({ error: 'internal error' });
    expect(err.message).toBe(
      'Coolify API POST /apps failed with 500: {"error":"internal error"}',
    );
  });

  test('preserves verbatim message for numeric body', () => {
    const err = new CoolifyHttpRequestError('DELETE', '/apps/1', 403, 403);
    expect(err.body).toBe(403);
    expect(err.message).toBe('Coolify API DELETE /apps/1 failed with 403: 403');
  });

  test('handles null body', () => {
    const err = new CoolifyHttpRequestError('GET', '/health', 503, null);
    expect(err.body).toBeNull();
    expect(err.status).toBe(503);
    expect(err.message).toBe('Coolify API GET /health failed with 503: null');
  });
});
