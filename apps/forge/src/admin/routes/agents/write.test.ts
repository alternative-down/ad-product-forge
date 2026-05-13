import { describe, it, expect, vi, beforeEach } from 'vitest';
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

  it('registers 2 agent write routes', () => {
    registerAgentWriteRoutes(mockHttpServer as any, mockReadModel as any, {
      db: {},
      workspaceBasePath: '/tmp',
      loaderConfig: {} as any,
    });
    expect(routes).toHaveLength(2);
  });

  it('registers POST /admin/agent/clear-history', () => {
    registerAgentWriteRoutes(mockHttpServer as any, mockReadModel as any, {
      db: {},
      workspaceBasePath: '/tmp',
      loaderConfig: {} as any,
    });
    expect(routes.find(r => r.path === '/admin/agent/clear-history' && r.method === 'POST')).toBeDefined();
  });

  it('registers POST /admin/agent/ltm-recall-search', () => {
    registerAgentWriteRoutes(mockHttpServer as any, mockReadModel as any, {
      db: {},
      workspaceBasePath: '/tmp',
      loaderConfig: {} as any,
    });
    expect(routes.find(r => r.path === '/admin/agent/ltm-recall-search' && r.method === 'POST')).toBeDefined();
  });

  it('both routes are POST method', () => {
    registerAgentWriteRoutes(mockHttpServer as any, mockReadModel as any, {
      db: {},
      workspaceBasePath: '/tmp',
      loaderConfig: {} as any,
    });
    expect(routes.every(r => r.method === 'POST')).toBe(true);
  });

  it('each route has a handler function', () => {
    registerAgentWriteRoutes(mockHttpServer as any, mockReadModel as any, {
      db: {},
      workspaceBasePath: '/tmp',
      loaderConfig: {} as any,
    });
    for (const route of routes) {
      expect(typeof route.handler).toBe('function');
    }
  });
});