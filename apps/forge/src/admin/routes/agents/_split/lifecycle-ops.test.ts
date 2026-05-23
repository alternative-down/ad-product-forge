import type { Database } from '../../../../database/schema';
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

describe('registerLifecycleOps', () => {
  let httpServer: MockHttpServer;
  let ops: any;

  beforeEach(() => {
    vi.clearAllMocks();
    httpServer = { registerRoute: vi.fn() };
    ops = {
      loadAgent: vi.fn().mockResolvedValue({
        runner: {
          forceIdle: vi.fn().mockResolvedValue(undefined),
          notifyExternalEvent: vi.fn(),
        },
      }),
      registry: {
        add: vi.fn().mockResolvedValue(undefined),
        get: vi.fn().mockReturnValue(null),
      },
    };
  });

  describe('POST /admin/agent/reload', () => {
    it('registers the route', async () => {
      const { registerLifecycleOps } = await import('./lifecycle-ops');
      registerLifecycleOps(httpServer as any, { db: {} as unknown as Database, loaderConfig: {} }, ops);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/reload' }),
      );
    });

    it('reloads agent and adds to registry', async () => {
      const { registerLifecycleOps } = await import('./lifecycle-ops');
      registerLifecycleOps(httpServer as any, { db: {} as unknown as Database, loaderConfig: {} }, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/reload');

      const response = await handler(makeRequest({ agentId: 'agent-123' }));

      const body = JSON.parse(response.body);
      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('agent-123');
      expect(ops.loadAgent).toHaveBeenCalled();
      expect(ops.registry.add).toHaveBeenCalled();
    });

    it('returns 500 on loadAgent error', async () => {
      const errorOps = {
        loadAgent: vi.fn().mockRejectedValue(new Error('Load failed')),
        registry: { add: vi.fn(), get: vi.fn() },
      };
      const { registerLifecycleOps } = await import('./lifecycle-ops');
      registerLifecycleOps(httpServer as any, { db: {} as unknown as Database, loaderConfig: {} }, errorOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/reload');

      const response = await handler(makeRequest({ agentId: 'agent-123' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/force-idle', () => {
    it('registers the route', async () => {
      const { registerLifecycleOps } = await import('./lifecycle-ops');
      registerLifecycleOps(httpServer as any, { db: {} as unknown as Database, loaderConfig: {} }, ops);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/force-idle' }),
      );
    });

    it('calls forceIdle on agent runner', async () => {
      const mockRunner = {
        forceIdle: vi.fn().mockResolvedValue(undefined),
        notifyExternalEvent: vi.fn(),
      };
      const getOps = {
        loadAgent: vi.fn(),
        registry: {
          add: vi.fn(),
          get: vi.fn().mockReturnValue({ runner: mockRunner }),
        },
      };
      const { registerLifecycleOps } = await import('./lifecycle-ops');
      registerLifecycleOps(httpServer as any, { db: {} as unknown as Database, loaderConfig: {} }, getOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/force-idle');

      const response = await handler(makeRequest({ agentId: 'agent-123' }));

      expect(response.status).toBe(200);
      expect(mockRunner.forceIdle).toHaveBeenCalled();
    });

    it('succeeds even when agent not in registry', async () => {
      const { registerLifecycleOps } = await import('./lifecycle-ops');
      registerLifecycleOps(httpServer as any, { db: {} as unknown as Database, loaderConfig: {} }, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/force-idle');

      const response = await handler(makeRequest({ agentId: 'agent-456' }));

      expect(response.status).toBe(200);
    });
  });

  describe('POST /admin/agent/rewakeup', () => {
    it('registers the route', async () => {
      const { registerLifecycleOps } = await import('./lifecycle-ops');
      registerLifecycleOps(httpServer as any, { db: {} as unknown as Database, loaderConfig: {} }, ops);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/rewakeup' }),
      );
    });

    it('notifies external event when agent is already running', async () => {
      const mockRunner = {
        forceIdle: vi.fn().mockResolvedValue(undefined),
        notifyExternalEvent: vi.fn(),
      };
      const getOps = {
        loadAgent: vi.fn().mockResolvedValue({ runner: mockRunner }),
        registry: {
          add: vi.fn(),
          get: vi.fn().mockReturnValue({ runner: mockRunner }),
        },
      };
      const { registerLifecycleOps } = await import('./lifecycle-ops');
      registerLifecycleOps(httpServer as any, { db: {} as unknown as Database, loaderConfig: {} }, getOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/rewakeup');

      const response = await handler(makeRequest({ agentId: 'agent-789' }));

      expect(response.status).toBe(200);
      expect(mockRunner.notifyExternalEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'admin-rewakeup',
          text: expect.stringContaining('Admin requested a forced rewakeup'),
        }),
      );
    });

    it('loads agent when not in registry', async () => {
      const loadedRuntime = { runner: { forceIdle: vi.fn(), notifyExternalEvent: vi.fn() } };
      let getCallCount = 0;
      const testOps = {
        loadAgent: vi.fn().mockResolvedValue(loadedRuntime),
        registry: {
          add: vi.fn().mockResolvedValue(undefined),
          get: vi.fn().mockImplementation(() => {
            getCallCount++;
            // First call: not in registry (triggers load)
            // Second call: after add, should return loaded agent
            return getCallCount > 1 ? loadedRuntime : null;
          }),
        },
      };
      const { registerLifecycleOps } = await import('./lifecycle-ops');
      registerLifecycleOps(httpServer as any, { db: {} as unknown as Database, loaderConfig: {} }, testOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/rewakeup');

      const response = await handler(makeRequest({ agentId: 'agent-new' }));

      expect(response.status).toBe(200);
      expect(testOps.loadAgent).toHaveBeenCalled();
      expect(testOps.registry.add).toHaveBeenCalled();
    });

    it('returns 500 on error', async () => {
      const errorOps = {
        loadAgent: vi.fn().mockRejectedValue(new Error('Load failed')),
        registry: { add: vi.fn(), get: vi.fn() },
      };
      const { registerLifecycleOps } = await import('./lifecycle-ops');
      registerLifecycleOps(httpServer as any, { db: {} as unknown as Database, loaderConfig: {} }, errorOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/rewakeup');

      const response = await handler(makeRequest({ agentId: 'agent-123' }));

      expect(response.status).toBe(500);
    });
  });
});
