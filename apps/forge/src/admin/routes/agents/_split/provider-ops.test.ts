import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { registerProviderOps } from './provider-ops';

interface MockRoute {
  method: string;
  path: string;
  handler: (req: { bodyText: string }) => Promise<{ status: number; body: string }>;
}
interface MockHttpServer {
  registerRoute: ReturnType<typeof vi.fn>;
}

function makeRequest(body: unknown): { bodyText: string } {
  return { bodyText: JSON.stringify(body) };
}

function getRouteHandler(
  httpServer: MockHttpServer,
  method: string,
  path: string,
): (req: { bodyText: string }) => Promise<{ status: number; body: string }> {
  const calls = httpServer.registerRoute.mock.calls as Array<[MockRoute]>;
  const match = calls.find((c) => c[0].method === method && c[0].path === path);
  if (!match) throw new Error(`Route ${method} ${path} not found`);
  return match[0].handler;
}

describe('registerProviderOps', () => {
  let httpServer: MockHttpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    httpServer = { registerRoute: vi.fn() };
  });

  describe('POST /admin/agent/providers/upsert', () => {
    it('registers the route', () => {
      registerProviderOps(httpServer as any);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/providers/upsert' }),
      );
    });

    it('returns 200 with agentId on valid request', async () => {
      registerProviderOps(httpServer as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/providers/upsert');

      const response = await handler(
        makeRequest({
          agentId: 'provider-agent-1',
          providerType: 'openai',
          credentials: { apiKey: 'sk-test', org: 'org-123' },
        }),
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('provider-agent-1');
    });

    it('returns 500 on invalid input', async () => {
      registerProviderOps(httpServer as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/providers/upsert');

      const response = await handler(makeRequest({ agentId: 'bad' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/providers/delete', () => {
    it('registers the route', () => {
      registerProviderOps(httpServer as any);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/providers/delete' }),
      );
    });

    it('returns 200 with agentId on valid request', async () => {
      registerProviderOps(httpServer as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/providers/delete');

      const response = await handler(
        makeRequest({ agentId: 'provider-agent-2', providerType: 'anthropic' }),
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('provider-agent-2');
    });

    it('returns 500 on missing providerType', async () => {
      registerProviderOps(httpServer as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/providers/delete');

      const response = await handler(makeRequest({ agentId: 'agent-no-type' }));

      expect(response.status).toBe(500);
    });
  });
});