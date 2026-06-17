import { describe, expect, it, vi } from 'vitest';
import { adminRouteError } from './admin-route-error-helper';

// Mock forgeDebug
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
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
    expect(result.body).toEqual({ error: 'null' });
  });

  it('returns 500 status code on undefined', () => {
    const result = adminRouteError(undefined);
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: 'undefined' });
  });

  it('extracts Error.message for Error instances', () => {
    const result = adminRouteError(new Error('specific error message'));
    expect(result.body).toEqual({ error: 'specific error message' });
  });

  it('extracts string value for string errors', () => {
    const result = adminRouteError('plain string error');
    expect(result.body).toEqual({ error: 'plain string error' });
  });

  it('returns String(error) for object errors', () => {
    const result = adminRouteError({ code: 'INVALID_INPUT' });
    expect(result.body).toEqual({ error: '{"code":"INVALID_INPUT"}' });
  });

  it('calls forgeDebug with scope and error message', async () => {
    const { forgeDebug } = await import('@forge-runtime/core');
    adminRouteError(new Error('debug test'));
    expect(forgeDebug).toHaveBeenCalledTimes(1);
    expect(forgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'admin',
        level: 'error',
        context: expect.objectContaining({ error: 'debug test' }),
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
      expect(result.body).toEqual({ error: 'boom' });
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
          context: expect.objectContaining({
            path: '/admin/agent/test',
            error: 'debug path test',
          }),
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
