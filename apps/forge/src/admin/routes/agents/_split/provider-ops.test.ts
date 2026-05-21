import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

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
    it('registers the route', async () => {
      const { registerProviderOps } = await import('./provider-ops');
      registerProviderOps(httpServer as Parameters<typeof registerProviderOps>[0]);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/admin/agent/providers/upsert',
        }),
      );
    });

    it('returns success with agentId', async () => {
      const { registerProviderOps } = await import('./provider-ops');
      registerProviderOps(httpServer as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/providers/upsert');

      const response = await handler(
        makeRequest({
          agentId: 'agent-123',
          providerType: 'openai',
          credentials: { apiKey: 'sk-test-key' },
        }),
      );

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('agent-123');
    });

    it('returns 500 on invalid body', async () => {
      const { registerProviderOps } = await import('./provider-ops');
      registerProviderOps(httpServer as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/providers/upsert');

      const response = await handler(makeRequest({ wrongField: 'value' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/providers/delete', () => {
    it('registers the route', async () => {
      const { registerProviderOps } = await import('./provider-ops');
      registerProviderOps(httpServer as any);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/admin/agent/providers/delete',
        }),
      );
    });

    it('returns success with agentId', async () => {
      const { registerProviderOps } = await import('./provider-ops');
      registerProviderOps(httpServer as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/providers/delete');

      const response = await handler(
        makeRequest({
          agentId: 'agent-456',
          providerType: 'anthropic',
        }),
      );

      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('agent-456');
    });

    it('returns 500 on invalid body', async () => {
      const { registerProviderOps } = await import('./provider-ops');
      registerProviderOps(httpServer as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/providers/delete');

      const response = await handler(makeRequest({ extraField: true }));

      expect(response.status).toBe(500);
    });
  });
});
