/**
 * Provider MCP Routes Tests
 *
 * Tests the 8 routes registered by registerAgentProviderMcpRoutes():
 *   POST /admin/agent-provider/upsert
 *   POST /admin/agent-provider/delete
 *   POST /admin/agent-mcp/create
 *   POST /admin/agent-mcp/update
 *   POST /admin/agent-mcp/delete
 *   POST /admin/agent-mcp/assign
 *   POST /admin/agent-mcp/set-active
 *   POST /admin/agent-mcp/detach
 *
 * No prior coverage.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// Zod mock: identity parse so route handlers can run without real schema validation.
// Methods return chainables so z.object() calls like z.string().min(1).optional() work.
const chainable = () => {
  const fn = vi.fn().mockReturnThis();
  fn.min = vi.fn().mockReturnThis();
  fn.max = vi.fn().mockReturnThis();
  fn.email = vi.fn().mockReturnThis();
  fn.url = vi.fn().mockReturnThis();
  fn.optional = vi.fn().mockReturnThis();
  fn.default = vi.fn().mockReturnThis();
  return fn;
};
vi.mock('zod', () => ({
  z: {
    object: vi.fn().mockImplementation(() => ({
      parse: vi.fn().mockImplementation((x) => x),
      safeParse: vi.fn().mockImplementation((x) => ({ success: true, data: x })),
      optional: vi.fn().mockReturnThis(),
      default: vi.fn().mockReturnThis(),
    })),
    string: chainable,
    boolean: chainable,
    enum: vi.fn().mockImplementation(() => chainable()),
    unknown: vi.fn().mockImplementation(() => chainable()),
    record: vi.fn().mockImplementation(() => chainable()),
    array: vi.fn().mockImplementation(() => chainable()),
    number: chainable,
    union: vi.fn().mockImplementation(() => chainable()),
    literal: chainable,
    intersection: vi.fn().mockImplementation(() => chainable()),
  },
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  LibsqlConversationStore: vi.fn(),
  toMastraSafeIdentifier: vi.fn().mockImplementation((id: string) => id),
  readOperationalMemoryState: vi.fn().mockResolvedValue({}),
  withTimeout: vi.fn().mockImplementation(async (promise: Promise<unknown>) => promise),
  WorkspaceEmbedderId: { Claude40Sonnet: 'claude-4-sonnet' },
}));

vi.mock('../../../capabilities/runtime', () => ({
  reloadAgentIfLoaded: vi.fn().mockResolvedValue(undefined),
  reloadAgentMcp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../communication/provider-loader', () => ({
  parseProviderCredentials: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../encryption/crypto', () => ({
  encryptSecret: vi.fn().mockImplementation((val: string) => `encrypted:${val}`),
}));

vi.mock('../schemas/discord', () => ({
  discordProviderDeleteSignalSchema: {
    parse: vi.fn().mockImplementation((x) => x),
  },
}));

function parseBody(response: { body: string }) {
  return JSON.parse(response.body);
}

// Mock httpServer: stores registered routes, exposes them for direct handler invocation
function createMockHttpServer() {
  const routes: unknown[] = [];
  return {
    registerRoute: vi.fn((route: unknown) => routes.push(route)),
    _routes: routes as Array<{
      method: string;
      path: string;
      handler: (req: { bodyText: string }) => Promise<unknown>;
    }>,
  };
}

// Drizzle chain mock: methods return the chain object (not a promise) so that
// chained calls like db.update().set().where() work synchronously.
// The route handler does NOT await db operations — it calls them and returns.
function makeChain() {
  const chain: Record<string, unknown> = {};
  ['delete', 'insert', 'update', 'select', 'from', 'where', 'set', 'values', 'orderBy'].forEach((m) => {
    chain[m] = vi.fn().mockReturnThis();
  });
  return chain as Record<string, ReturnType<typeof vi.fn>>;
}

function createMockDb() {
  return {
    delete: vi.fn().mockReturnValue(makeChain()),
    insert: vi.fn().mockReturnValue(makeChain()),
    update: vi.fn().mockReturnValue(makeChain()),
    select: vi.fn().mockReturnValue(makeChain()),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    query: {
      agentProviders: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentMcpConfigs: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  };
}

function createMockLoaderConfig() {
  return { loadAgent: vi.fn() };
}

describe('registerAgentProviderMcpRoutes', () => {
  let httpServer: ReturnType<typeof createMockHttpServer>;
  let db: ReturnType<typeof createMockDb>;
  let loaderConfig: ReturnType<typeof createMockLoaderConfig>;
  let registerAgentProviderMcpRoutes: (opts: {
    httpServer: ReturnType<typeof createMockHttpServer>;
    db: ReturnType<typeof createMockDb>;
    loaderConfig: ReturnType<typeof createMockLoaderConfig>;
  }) => void;

  beforeEach(async () => {
    httpServer = createMockHttpServer();
    db = createMockDb();
    loaderConfig = createMockLoaderConfig();
    vi.clearAllMocks();

    const module = await vi.importActual<{ registerAgentProviderMcpRoutes: (opts: {
      httpServer: ReturnType<typeof createMockHttpServer>;
      db: ReturnType<typeof createMockDb>;
      loaderConfig: ReturnType<typeof createMockLoaderConfig>;
    }) => void }>('./provider-mcp');
    registerAgentProviderMcpRoutes = module.registerAgentProviderMcpRoutes;
  });

  // ─── Route Registration ───────────────────────────────────────────────────

  it('registers POST /admin/agent-provider/upsert', () => {
    registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
    const route = httpServer._routes.find((r) => r.path === '/admin/agent-provider/upsert');
    expect(route).toBeDefined();
    expect(route?.method).toBe('POST');
  });

  it('registers POST /admin/agent-provider/delete', () => {
    registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
    const route = httpServer._routes.find((r) => r.path === '/admin/agent-provider/delete');
    expect(route).toBeDefined();
    expect(route?.method).toBe('POST');
  });

  it('registers POST /admin/agent-mcp/create', () => {
    registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
    const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/create');
    expect(route).toBeDefined();
    expect(route?.method).toBe('POST');
  });

  it('registers POST /admin/agent-mcp/update', () => {
    registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
    const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/update');
    expect(route).toBeDefined();
    expect(route?.method).toBe('POST');
  });

  it('registers POST /admin/agent-mcp/delete', () => {
    registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
    const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/delete');
    expect(route).toBeDefined();
    expect(route?.method).toBe('POST');
  });

  it('registers POST /admin/agent-mcp/assign', () => {
    registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
    const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/assign');
    expect(route).toBeDefined();
    expect(route?.method).toBe('POST');
  });

  it('registers POST /admin/agent-mcp/set-active', () => {
    registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
    const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/set-active');
    expect(route).toBeDefined();
    expect(route?.method).toBe('POST');
  });

  it('registers POST /admin/agent-mcp/detach', () => {
    registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
    const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/detach');
    expect(route).toBeDefined();
    expect(route?.method).toBe('POST');
  });

  // ─── POST /admin/agent-provider/upsert ───────────────────────────────────

  describe('POST /admin/agent-provider/upsert', () => {
    it('inserts new provider when none exists', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-provider/upsert');

      const response = (await route!.handler({
        bodyText: JSON.stringify({ agentId: 'agent-42', providerType: 'discord', credentials: { token: 'tok' } }),
      })) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true, agentId: 'agent-42', providerType: 'discord' });
      expect(db.insert).toHaveBeenCalled();
    });

    it('updates existing provider', async () => {
      db.query.agentProviders.findFirst = vi.fn().mockResolvedValue({ id: 'prov-1', agentId: 'agent-42' });
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-provider/upsert');

      const response = (await route!.handler({
        bodyText: JSON.stringify({ agentId: 'agent-42', providerType: 'discord', credentials: { token: 'tok' } }),
      })) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(db.update).toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('deletes discord provider when token is empty whitespace', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-provider/upsert');

      const response = (await route!.handler({
        bodyText: JSON.stringify({ agentId: 'agent-42', providerType: 'discord', credentials: { token: '   ' } }),
      })) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true });
      expect(db.delete).toHaveBeenCalled();
    });

    it('returns 500 on malformed JSON', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-provider/upsert');

      const response = (await route!.handler({ bodyText: 'not-json' })) as { status: number; body: string };

      expect(response.status).toBe(500);
      expect(parseBody(response)).toHaveProperty('error');
    });
  });

  // ─── POST /admin/agent-provider/delete ───────────────────────────────────

  describe('POST /admin/agent-provider/delete', () => {
    it('deletes provider by agentId and providerType', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-provider/delete');

      const response = (await route!.handler({
        bodyText: JSON.stringify({ agentId: 'agent-42', providerType: 'discord' }),
      })) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true, agentId: 'agent-42', providerType: 'discord' });
      expect(db.delete).toHaveBeenCalled();
    });

    it('returns 500 on malformed JSON', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-provider/delete');

      const response = (await route!.handler({ bodyText: 'invalid' })) as { status: number; body: string };

      expect(response.status).toBe(500);
    });
  });

  // ─── POST /admin/agent-mcp/create ───────────────────────────────────────

  describe('POST /admin/agent-mcp/create', () => {
    it('creates mcp server and assigns to agent', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/create');

      const response = (await route!.handler({
        bodyText: JSON.stringify({
          agentId: 'agent-42',
          name: 'Test Server',
          transport: 'stdio',
          command: '/usr/bin/mcp',
        }),
      })) as { status: number; body: string };

      expect(response.status).toBe(201);
      const body = parseBody(response);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('agent-42');
      expect(body.configId).toBeTruthy();
      expect(body.serverId).toBeTruthy();
      expect(db.insert).toHaveBeenCalledTimes(2);
    });

    it('returns 500 on malformed JSON', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/create');

      const response = (await route!.handler({ bodyText: 'not-json' })) as { status: number; body: string };

      expect(response.status).toBe(500);
    });
  });

  // ─── POST /admin/agent-mcp/update ───────────────────────────────────────

  describe('POST /admin/agent-mcp/update', () => {
    it('updates mcp server and agent config', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/update');

      const response = (await route!.handler({
        bodyText: JSON.stringify({
          serverId: 'srv-1',
          agentId: 'agent-42',
          name: 'Updated Server',
          isActive: true,
        }),
      })) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true });
      expect(db.update).toHaveBeenCalledTimes(2);
    });

    it('returns 500 on malformed JSON', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/update');

      const response = (await route!.handler({ bodyText: 'not-json' })) as { status: number; body: string };

      expect(response.status).toBe(500);
    });
  });

  // ─── POST /admin/agent-mcp/delete ───────────────────────────────────────

  describe('POST /admin/agent-mcp/delete', () => {
    it('deletes config and server when no remaining links', async () => {
      db.query.agentMcpConfigs.findMany = vi.fn().mockResolvedValue([]);
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/delete');

      const response = (await route!.handler({
        bodyText: JSON.stringify({ configId: 'cfg-1', serverId: 'srv-1', agentId: 'agent-42' }),
      })) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true, configId: 'cfg-1', serverId: 'srv-1' });
      expect(db.delete).toHaveBeenCalledTimes(2);
    });

    it('keeps server when other agents still reference it', async () => {
      db.query.agentMcpConfigs.findMany = vi.fn().mockResolvedValue([{ id: 'cfg-2' }]);
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/delete');

      const response = (await route!.handler({
        bodyText: JSON.stringify({ configId: 'cfg-1', serverId: 'srv-1', agentId: 'agent-42' }),
      })) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(db.delete).toHaveBeenCalledTimes(1);
    });

    it('returns 500 on malformed JSON', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/delete');

      const response = (await route!.handler({ bodyText: 'not-json' })) as { status: number; body: string };

      expect(response.status).toBe(500);
    });
  });

  // ─── POST /admin/agent-mcp/assign ─────────────────────────────────────────

  describe('POST /admin/agent-mcp/assign', () => {
    it('creates new assignment when none exists', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/assign');

      const response = (await route!.handler({
        bodyText: JSON.stringify({ agentId: 'agent-42', serverId: 'srv-1', isActive: true }),
      })) as { status: number; body: string };

      expect(response.status).toBe(201);
      const body = parseBody(response);
      expect(body.success).toBe(true);
      expect(body.configId).toBeTruthy();
      expect(db.insert).toHaveBeenCalled();
    });

    it('updates existing assignment', async () => {
      db.query.agentMcpConfigs.findFirst = vi.fn().mockResolvedValue({ id: 'cfg-1', agentId: 'agent-42' });
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/assign');

      const response = (await route!.handler({
        bodyText: JSON.stringify({ agentId: 'agent-42', serverId: 'srv-1', isActive: false }),
      })) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(db.update).toHaveBeenCalled();
      expect(db.insert).not.toHaveBeenCalled();
    });

    it('returns 500 on malformed JSON', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/assign');

      const response = (await route!.handler({ bodyText: 'not-json' })) as { status: number; body: string };

      expect(response.status).toBe(500);
    });
  });

  // ─── POST /admin/agent-mcp/set-active ───────────────────────────────────

  describe('POST /admin/agent-mcp/set-active', () => {
    it('updates isActive on agent config', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/set-active');

      const response = (await route!.handler({
        bodyText: JSON.stringify({ configId: 'cfg-1', agentId: 'agent-42', isActive: true }),
      })) as { status: number; body: string };

      expect(response.status).toBe(200);
      const body = parseBody(response);
      expect(body.success).toBe(true);
      expect(body.isActive).toBe(true);
      expect(db.update).toHaveBeenCalled();
    });

    it('returns 500 on malformed JSON', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/set-active');

      const response = (await route!.handler({ bodyText: 'not-json' })) as { status: number; body: string };

      expect(response.status).toBe(500);
    });
  });

  // ─── POST /admin/agent-mcp/detach ───────────────────────────────────────

  describe('POST /admin/agent-mcp/detach', () => {
    it('deletes agent-server assignment', async () => {
      db.query.agentMcpConfigs.findFirst = vi.fn().mockResolvedValue({ id: 'cfg-1', agentId: 'agent-42' });
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/detach');

      const response = (await route!.handler({
        bodyText: JSON.stringify({ configId: 'cfg-1', agentId: 'agent-42' }),
      })) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true, configId: 'cfg-1', agentId: 'agent-42' });
      expect(db.delete).toHaveBeenCalled();
    });

    it('returns 500 on malformed JSON', async () => {
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-mcp/detach');

      const response = (await route!.handler({ bodyText: 'not-json' })) as { status: number; body: string };

      expect(response.status).toBe(500);
    });
  });

  // ─── Error Handling ──────────────────────────────────────────────────────

  describe('error handling', () => {
    it('returns 500 with error message on unexpected error', async () => {
      db.query.agentProviders.findFirst = vi.fn().mockRejectedValue(new Error('DB error'));
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-provider/upsert');

      const response = (await route!.handler({
        bodyText: JSON.stringify({ agentId: 'agent-42', providerType: 'discord', credentials: { token: 'tok' } }),
      })) as { status: number; body: string };

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB error');
    });

    it('forgeDebug is called on route errors', async () => {
      const { forgeDebug } = await vi.importMock('@forge-runtime/core');
      db.query.agentProviders.findFirst = vi.fn().mockRejectedValue(new Error('boom'));
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig });
      const route = httpServer._routes.find((r) => r.path === '/admin/agent-provider/upsert');

      await route!.handler({
        bodyText: JSON.stringify({ agentId: 'agent-42', providerType: 'discord', credentials: { token: 'tok' } }),
      });

      expect(forgeDebug).toHaveBeenCalled();
    });
  });
});
