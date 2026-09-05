import { describe, it, expect, vi, beforeEach } from 'vitest';

const routeMocks = vi.hoisted(() => ({
  clearAgentHistory: vi.fn().mockResolvedValue(undefined),
  reloadAgentIfLoaded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./agent-history', () => ({
  clearAgentHistory: routeMocks.clearAgentHistory,
}));

vi.mock('../../../capabilities/runtime', () => ({
  reloadAgentIfLoaded: routeMocks.reloadAgentIfLoaded,
}));

import { registerAgentWriteRoutes } from './write';

describe('registerAgentWriteRoutes', () => {
  let routes: { method: string; path: string; handler: unknown }[];

  const mockHttpServer = {
    registerRoute: vi.fn((route: { method: string; path: string; handler: unknown }) => {
      routes.push(route);
    }),
  };

  const mockReadModel = {
    debugAgentLongTermMemoryRecallSearch: vi.fn().mockResolvedValue({ results: [] }),
  };

  beforeEach(() => {
    routes = [];
    vi.clearAllMocks();
  });

  it('registers 1 agent write route (clear-history; ltm-recall-search was extracted to _split in #2468)', () => {
    registerAgentWriteRoutes(mockHttpServer as any, mockReadModel as any, {
      db: {} as any,
      workspaceBasePath: '/tmp',
      loaderConfig: {} as any,
    });
    expect(routes).toHaveLength(1);
  });

  it('registers POST /admin/agent/clear-history', () => {
    registerAgentWriteRoutes(mockHttpServer as any, mockReadModel as any, {
      db: {} as any,
      workspaceBasePath: '/tmp',
      loaderConfig: {} as any,
    });
    expect(
      routes.find((r) => r.path === '/admin/agent/clear-history' && r.method === 'POST'),
    ).toBeDefined();
  });

  it('clears persisted history before reloading the agent', async () => {
    const db = {} as never;
    const loaderConfig = {} as never;
    registerAgentWriteRoutes(mockHttpServer as never, mockReadModel, {
      db,
      workspaceBasePath: '/tmp/workspaces',
      loaderConfig,
    });
    const route = routes.find((candidate) => candidate.path === '/admin/agent/clear-history');
    const handler = route?.handler as (request: { bodyText: string }) => Promise<unknown>;

    await handler({
      bodyText: JSON.stringify({
        agentId: 'agent-1',
        includeLongTermMemoryThread: true,
      }),
    });

    expect(routeMocks.clearAgentHistory).toHaveBeenCalledWith({
      db,
      workspaceBasePath: '/tmp/workspaces',
      agentId: 'agent-1',
    });
    expect(routeMocks.reloadAgentIfLoaded).toHaveBeenCalledWith(db, loaderConfig, 'agent-1');
    expect(routeMocks.clearAgentHistory.mock.invocationCallOrder[0]).toBeLessThan(
      routeMocks.reloadAgentIfLoaded.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('route is POST method', () => {
    registerAgentWriteRoutes(mockHttpServer as any, mockReadModel as any, {
      db: {} as any,
      workspaceBasePath: '/tmp',
      loaderConfig: {} as any,
    });
    expect(routes.every((r) => r.method === 'POST')).toBe(true);
  });

  it('each route has a handler function', () => {
    registerAgentWriteRoutes(mockHttpServer as any, mockReadModel as any, {
      db: {} as any,
      workspaceBasePath: '/tmp',
      loaderConfig: {} as any,
    });
    for (const route of routes) {
      expect(typeof route.handler).toBe('function');
    }
  });
});
