import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

// Static import — no deep mocks needed for this module.
import { registerLifecycleOps } from './lifecycle-ops';

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

describe('registerLifecycleOps', () => {
  let httpServer: MockHttpServer;
  let mockLoaderConfig: any;
  let mockDb: any;
  let mockOps: {
    loadAgent: ReturnType<typeof vi.fn>;
    registry: {
      add: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    httpServer = { registerRoute: vi.fn() };
    mockLoaderConfig = { config: 'value' };
    mockDb = {};
    mockOps = {
      loadAgent: vi.fn().mockResolvedValue({ agentId: 'loaded-agent', runner: {} }),
      registry: {
        add: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockReturnValue(null),
      },
    };
  });

  describe('POST /admin/agent/reload', () => {
    it('registers the route', () => {
      registerLifecycleOps(httpServer as any, { db: mockDb, loaderConfig: mockLoaderConfig }, mockOps as any);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/reload' }),
      );
    });

    it('loads agent and adds to registry', async () => {
      registerLifecycleOps(httpServer as any, { db: mockDb, loaderConfig: mockLoaderConfig }, mockOps as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/reload');

      const response = await handler(makeRequest({ agentId: 'agent-reload' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('agent-reload');
      expect(mockOps.loadAgent).toHaveBeenCalledWith(mockDb, { config: 'value', agentId: 'agent-reload' });
      expect(mockOps.registry.add).toHaveBeenCalledWith(mockDb, { agentId: 'loaded-agent', runner: {} });
    });

    it('returns 500 on load error', async () => {
      mockOps.loadAgent.mockRejectedValue(new Error('Load failed'));
      registerLifecycleOps(httpServer as any, { db: mockDb, loaderConfig: mockLoaderConfig }, mockOps as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/reload');

      const response = await handler(makeRequest({ agentId: 'agent-fail' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/force-idle', () => {
    it('registers the route', () => {
      registerLifecycleOps(httpServer as any, { db: mockDb, loaderConfig: mockLoaderConfig }, mockOps as any);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/force-idle' }),
      );
    });

    it('calls forceIdle on running agent', async () => {
      const forceIdle = vi.fn().mockResolvedValue(undefined);
      mockOps.registry.get.mockReturnValue({ runner: { forceIdle } });
      registerLifecycleOps(httpServer as any, { db: mockDb, loaderConfig: mockLoaderConfig }, mockOps as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/force-idle');

      const response = await handler(makeRequest({ agentId: 'agent-running' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('agent-running');
      expect(forceIdle).toHaveBeenCalled();
    });

    it('does not throw if agent not in registry', async () => {
      mockOps.registry.get.mockReturnValue(null);
      registerLifecycleOps(httpServer as any, { db: mockDb, loaderConfig: mockLoaderConfig }, mockOps as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/force-idle');

      const response = await handler(makeRequest({ agentId: 'agent-not-running' }));

      expect(response.status).toBe(200);
    });

    it('returns 500 on forceIdle error', async () => {
      const forceIdle = vi.fn().mockRejectedValue(new Error('ForceIdle failed'));
      mockOps.registry.get.mockReturnValue({ runner: { forceIdle } });
      registerLifecycleOps(httpServer as any, { db: mockDb, loaderConfig: mockLoaderConfig }, mockOps as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/force-idle');

      const response = await handler(makeRequest({ agentId: 'agent-fail' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/rewakeup', () => {
    it('registers the route', () => {
      registerLifecycleOps(httpServer as any, { db: mockDb, loaderConfig: mockLoaderConfig }, mockOps as any);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/rewakeup' }),
      );
    });

    it('calls notifyExternalEvent on running agent', async () => {
      const notifyExternalEvent = vi.fn();
      mockOps.registry.get.mockReturnValue({ runner: { forceIdle: vi.fn(), notifyExternalEvent } });
      registerLifecycleOps(httpServer as any, { db: mockDb, loaderConfig: mockLoaderConfig }, mockOps as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/rewakeup');

      const response = await handler(makeRequest({ agentId: 'agent-rewakeup' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(notifyExternalEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'admin-rewakeup',
          groupKey: expect.stringContaining('admin-rewakeup:agent-rewakeup'),
          text: expect.stringContaining('forced rewakeup'),
        }),
      );
    });

    it('loads agent and calls notifyExternalEvent if not already running', async () => {
      const notifyExternalEvent = vi.fn();
      const newRuntime = { agentId: 'new-agent', runner: { forceIdle: vi.fn(), notifyExternalEvent } };
      mockOps.loadAgent.mockResolvedValue(newRuntime);
      // First get returns null (triggers else branch), second get returns the added entry
      mockOps.registry.get
        .mockReturnValueOnce(null)
        .mockReturnValueOnce(newRuntime);
      registerLifecycleOps(httpServer as any, { db: mockDb, loaderConfig: mockLoaderConfig }, mockOps as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/rewakeup');

      const response = await handler(makeRequest({ agentId: 'agent-new' }));

      expect(response.status).toBe(200);
      expect(mockOps.loadAgent).toHaveBeenCalledWith(mockDb, { config: 'value', agentId: 'agent-new' });
      expect(mockOps.registry.add).toHaveBeenCalledWith(mockDb, newRuntime);
      expect(notifyExternalEvent).toHaveBeenCalled();
    });

    it('returns 500 when agent not in registry and loadAgent undefined', async () => {
      mockOps.registry.get.mockReturnValue(null);
      mockOps.loadAgent = undefined as any;
      registerLifecycleOps(httpServer as any, { db: mockDb, loaderConfig: mockLoaderConfig }, mockOps as any);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/rewakeup');

      const response = await handler(makeRequest({ agentId: 'agent-noload' }));

      expect(response.status).toBe(500);
    });
  });
});