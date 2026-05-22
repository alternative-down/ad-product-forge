/**
 * Tests for Coolify HTTP transport layer.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createHttpTransport } from './http';

function createMockIntegrations(getCoolifyConfigResult?: unknown, err?: Error) {
  return {
    getCoolifyConfig: vi.fn().mockImplementation(async () => {
      if (err) throw err;
      return getCoolifyConfigResult;
    }),
  };
}

const MOCK_PROVIDER_CONFIG = {
  baseUrl: 'https://coolify.example.com',
  adminToken: 'test-token',
  serverId: 'server-001',
  destinationId: 'dest-001',
  applicationsBaseDomain: 'app.example.com',
};

describe('HttpTransport', () => {
  let responses: Record<string, { status: number; body?: unknown }>;
  let mockFetch: ReturnType<typeof vi.fn>;
  let mockForgeDebug: ReturnType<typeof vi.fn>;
  let integrations: ReturnType<typeof createMockIntegrations>;

  let httpTransport: ReturnType<typeof createHttpTransport>;

  beforeEach(() => {
    responses = {
      'GET /test': { status: 200, body: { data: 'ok' } },
      'POST /test': { status: 201, body: { created: true } },
      'PATCH /test': { status: 200, body: { updated: true } },
      'DELETE /test': { status: 204, body: undefined },
    };

    mockFetch = vi
      .fn()
      .mockImplementation((url: string, options?: { method?: string; body?: string }) => {
        const baseUrl = 'https://coolify.example.com/api/v1';
        const path = url.startsWith(baseUrl) ? url.slice(baseUrl.length) : url;
        const key = `${options?.method ?? 'GET'} ${path.split('?')[0]}`;
        const response = responses[key] ?? { status: 200, body: {} };
        const text = response.body != null ? JSON.stringify(response.body) : '';
        return Promise.resolve({
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          text: () => Promise.resolve(text),
        });
      });

    vi.stubGlobal('fetch', mockFetch);
    integrations = createMockIntegrations(MOCK_PROVIDER_CONFIG);
    httpTransport = createHttpTransport({ integrations } as any);
    mockForgeDebug = vi.fn();
    vi.stubGlobal('forgeDebug', mockForgeDebug);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('requestJson', () => {
    it('makes GET request and returns parsed JSON', async () => {
      const result = await httpTransport.requestJson('GET', '/test');
      expect(result).toEqual({ data: 'ok' });
    });

    it('makes POST request with JSON body', async () => {
      const result = await httpTransport.requestJson('POST', '/test', { key: 'value' });
      expect(result).toEqual({ created: true });
      const [, opts] = mockFetch.mock.calls[0];
      expect(JSON.parse(opts.body as string)).toEqual({ key: 'value' });
    });

    it('sets correct headers including Authorization', async () => {
      await httpTransport.requestJson('GET', '/test');
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers).toMatchObject({
        Authorization: 'Bearer test-token',
        Accept: 'application/json',
      });
    });

    it('sets Content-Type header when body is provided', async () => {
      await httpTransport.requestJson('POST', '/test', { key: 'value' });
      const [, opts] = mockFetch.mock.calls[0];
      expect(opts.headers).toMatchObject({
        'Content-Type': 'application/json',
      });
    });

    it('throws on HTTP error with status code', async () => {
      responses['GET /error'] = { status: 404, body: { message: 'Not found' } };
      await expect(httpTransport.requestJson('GET', '/error')).rejects.toThrow('404');
    });

    it('throws on network failure', async () => {
      mockFetch.mockImplementationOnce(() => Promise.reject(new Error('Network error')));
      await expect(httpTransport.requestJson('GET', '/test')).rejects.toThrow('Network error');
    });

    it('handles empty response body', async () => {
      responses['DELETE /test'] = { status: 204, body: undefined };
      const result = await httpTransport.requestJson('DELETE', '/test');
      expect(result).toBeNull();
    });
  });
});