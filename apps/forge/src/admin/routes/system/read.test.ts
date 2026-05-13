import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerSystemReadRoutes } from './read';
// import type { SystemReadModel } from './read';
type SystemReadModel = any;

vi.mock('../../../database/schema', () => ({
  mcpServerConfigs: { id: null, name: null } as any,
}));

vi.mock('../../../agents/global-skills', () => ({
  listGlobalSkills: vi.fn().mockResolvedValue([]),
}));

vi.mock('./oauth-state', () => ({
  buildOauthState: vi.fn().mockResolvedValue({ storePath: '/mock', providers: [] }),
}));

vi.mock('./healthcheck', () => ({
  buildSystemHealthcheck: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

describe('registerSystemReadRoutes', () => {
  let routes: { method: string; path: string }[];

  const mockHttpServer = {
    registerRoute: vi.fn((route: { method: string; path: string; handler: unknown }) => {
      routes.push(route);
    }),
  };

  const mockDb = { select: vi.fn().mockReturnThis(), from: vi.fn().mockReturnThis(), all: vi.fn().mockResolvedValue([]) } as any;
  const mockRegistry = { list: vi.fn().mockReturnValue([]) } as any;
  const mockReadModel: SystemReadModel = {
    listSystemIntegrations: vi.fn().mockResolvedValue([]),
    getSystemSettings: vi.fn().mockResolvedValue({}),
    getSystemLlm: vi.fn().mockResolvedValue({}),
    getApplicationMigrations: vi.fn().mockResolvedValue([]),
  };

  beforeEach(() => {
    routes = [];
    vi.clearAllMocks();
  });

  it('registers 8 system read routes', () => {
    registerSystemReadRoutes({
      httpServer: mockHttpServer as any,
      db: mockDb,
      registry: mockRegistry,
      readModel: mockReadModel,
      workspaceBasePath: '/tmp',
    } as any);
    expect(routes).toHaveLength(8);
  });

  it('registers GET /admin/system/healthcheck', () => {
    registerSystemReadRoutes({ httpServer: mockHttpServer as any, db: mockDb, registry: mockRegistry, readModel: mockReadModel, workspaceBasePath: '/tmp' } as any);
    expect(routes.find(r => r.path === '/admin/system/healthcheck' && r.method === 'GET')).toBeDefined();
  });

  it('registers GET /admin/system/integrations', () => {
    registerSystemReadRoutes({ httpServer: mockHttpServer as any, db: mockDb, registry: mockRegistry, readModel: mockReadModel, workspaceBasePath: '/tmp' } as any);
    expect(routes.find(r => r.path === '/admin/system/integrations' && r.method === 'GET')).toBeDefined();
  });

  it('registers GET /admin/system/settings', () => {
    registerSystemReadRoutes({ httpServer: mockHttpServer as any, db: mockDb, registry: mockRegistry, readModel: mockReadModel, workspaceBasePath: '/tmp' } as any);
    expect(routes.find(r => r.path === '/admin/system/settings' && r.method === 'GET')).toBeDefined();
  });

  it('registers GET /admin/system/llm', () => {
    registerSystemReadRoutes({ httpServer: mockHttpServer as any, db: mockDb, registry: mockRegistry, readModel: mockReadModel, workspaceBasePath: '/tmp' } as any);
    expect(routes.find(r => r.path === '/admin/system/llm' && r.method === 'GET')).toBeDefined();
  });

  it('registers GET /admin/system/mcp', () => {
    registerSystemReadRoutes({ httpServer: mockHttpServer as any, db: mockDb, registry: mockRegistry, readModel: mockReadModel, workspaceBasePath: '/tmp' } as any);
    expect(routes.find(r => r.path === '/admin/system/mcp' && r.method === 'GET')).toBeDefined();
  });

  it('registers GET /admin/system/migrations', () => {
    registerSystemReadRoutes({ httpServer: mockHttpServer as any, db: mockDb, registry: mockRegistry, readModel: mockReadModel, workspaceBasePath: '/tmp' } as any);
    expect(routes.find(r => r.path === '/admin/system/migrations' && r.method === 'GET')).toBeDefined();
  });

  it('registers GET /admin/system/skills', () => {
    registerSystemReadRoutes({ httpServer: mockHttpServer as any, db: mockDb, registry: mockRegistry, readModel: mockReadModel, workspaceBasePath: '/tmp' } as any);
    expect(routes.find(r => r.path === '/admin/system/skills' && r.method === 'GET')).toBeDefined();
  });

  it('registers GET /admin/system/oauth', () => {
    registerSystemReadRoutes({ httpServer: mockHttpServer as any, db: mockDb, registry: mockRegistry, readModel: mockReadModel, workspaceBasePath: '/tmp' } as any);
    expect(routes.find(r => r.path === '/admin/system/oauth' && r.method === 'GET')).toBeDefined();
  });
});
