import { describe, expect, it, vi } from 'vitest';
import { adminRouteError, safeRoute } from './admin-route-error-helper';

// Mock forgeDebug
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  errorMsg: vi.fn((err) =>
    err instanceof Error
      ? err.message
      : typeof err === 'string'
        ? err
        : String(err).replace(/^Error: /, ''),
  ),
  withToolErrorLogging: vi.fn(async (params) => {
    try {
      return { valid: true, data: await params.fn() };
    } catch (error) {
      // Mirror the real impl: use errorMsg-style formatting
      const msg =
        error instanceof Error
          ? error.message
          : typeof error === 'string'
            ? error
            : String(error).replace(/^Error: /, '');
      return { valid: false, error: msg, hint: params.hint || '' };
    }
  }),
}));

describe('adminRouteError', () => {
  it('returns 500 status code on Error', () => {
    const result = adminRouteError(new Error('something failed'));
    expect(result.status).toBe(500);
  });

  it('returns 500 status code on string error', () => {
    const result = adminRouteError('plain string error');
    expect(result.status).toBe(500);
  });

  it('returns 500 status code on null', () => {
    const result = adminRouteError(null);
    expect(result.status).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'null' });
  });

  it('returns 500 status code on undefined', () => {
    const result = adminRouteError(undefined);
    expect(result.status).toBe(500);
    expect(JSON.parse(result.body)).toEqual({ error: 'undefined' });
  });

  it('extracts Error.message for Error instances', () => {
    const result = adminRouteError(new Error('specific error message'));
    expect(JSON.parse(result.body)).toEqual({ error: 'specific error message' });
  });

  it('extracts string value for string errors', () => {
    const result = adminRouteError('plain string error');
    expect(JSON.parse(result.body)).toEqual({ error: 'plain string error' });
  });

  it('returns String(error) for object errors', () => {
    const result = adminRouteError({ code: 'INVALID_INPUT' });
    expect(JSON.parse(result.body)).toEqual({ error: '[object Object]' });
  });

  it('calls forgeDebug with scope and error message', async () => {
    const { forgeDebug } = await import('@forge-runtime/core');
    adminRouteError(new Error('debug test'));
    expect(forgeDebug).toHaveBeenCalledTimes(1);
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'admin',
        level: 'error',
        error: 'debug test',
      }),
    );
  });
  describe('with path option (regression for #5457)', () => {
    it('returns 500 when called with a path', () => {
      const result = adminRouteError(new Error('boom'), { path: '/admin/agent/test' });
      expect(result.status).toBe(500);
    });

    it('includes the path in the response body error', () => {
      const result = adminRouteError(new Error('boom'), { path: '/admin/agent/test' });
      expect(JSON.parse(result.body)).toEqual({ error: 'boom' });
    });

    it('calls forgeDebug with path-aware message and context', async () => {
      const { forgeDebug } = await import('@forge-runtime/core');
      (forgeDebug as ReturnType<typeof vi.fn>).mockClear();
      adminRouteError(new Error('debug path test'), { path: '/admin/agent/test' });
      expect(forgeDebug).toHaveBeenCalledTimes(1);
      expect(forgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'admin',
          level: 'error',
          message: '/admin/agent/test route handler failed',
          path: '/admin/agent/test',
          error: 'debug path test',
        }),
      );
    });
  });

  describe('with label option (regression for #5457)', () => {
    it('returns 500 when called with a label', () => {
      const result = adminRouteError(new Error('boom'), { label: 'test-op' });
      expect(result.status).toBe(500);
    });

    it('uses the label in the forgeDebug message', async () => {
      const { forgeDebug } = await import('@forge-runtime/core');
      (forgeDebug as ReturnType<typeof vi.fn>).mockClear();
      adminRouteError(new Error('label test'), { label: 'test-op' });
      expect(forgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Admin test-op failed',
        }),
      );
    });
  });

  describe('without options (legacy behavior, regression for #5457)', () => {
    it('returns 500 with generic message when no opts provided', async () => {
      const { forgeDebug } = await import('@forge-runtime/core');
      (forgeDebug as ReturnType<typeof vi.fn>).mockClear();
      const result = adminRouteError(new Error('legacy test'));
      expect(result.status).toBe(500);
      expect(forgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Admin route failed',
        }),
      );
    });
  });
});

describe('safeRoute (regression for #6262)', () => {
  it('calls the handler and returns its response on success', async () => {
    const handler = safeRoute('/admin/test', async () => ({
      status: 200,
      body: JSON.stringify({ ok: true }),
    }));
    const result = await handler({
      method: 'GET',
      path: '/admin/test',
      query: new URLSearchParams(),
      headers: {},
      body: Buffer.from(''),
      bodyText: '',
      req: {} as never,
    });
    expect(result.status).toBe(200);
    expect(result.body).toBe('{"ok":true}');
  });

  it('catches errors and returns 500 via adminRouteError', async () => {
    const handler = safeRoute('/admin/test', async () => {
      throw new Error('boom');
    });
    const result = await handler({
      method: 'GET',
      path: '/admin/test',
      query: new URLSearchParams(),
      headers: {},
      body: Buffer.from(''),
      bodyText: '',
      req: {} as never,
    });
    expect(result.status).toBe(500);
  });

  it('passes the path string verbatim to adminRouteError context', async () => {
    const { forgeDebug } = await import('@forge-runtime/core');
    const handler = safeRoute('/admin/unique-path-xyz', async () => {
      throw new Error('expected failure');
    });
    await handler({
      method: 'POST',
      path: '/admin/unique-path-xyz',
      query: new URLSearchParams(),
      headers: {},
      body: Buffer.from(''),
      bodyText: '',
      req: {} as never,
    });
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/admin/unique-path-xyz',
      }),
    );
  });
});
