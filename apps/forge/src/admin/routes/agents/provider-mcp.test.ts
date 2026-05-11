/**
 * Route-level tests for registerAgentProviderMcpRoutes in
 * admin/routes/agents/provider-mcp.ts.
 * 8 routes: agent-provider/upsert, agent-provider/delete,
 * agent-mcp/create, agent-mcp/update, agent-mcp/delete,
 * agent-mcp/assign, agent-mcp/set-active, agent-mcp/detach.
 * Part of #1874 incremental coverage of admin/routes.ts inline handlers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks (time-dependent: createId, Date.now, Date.toISOString) ────

const { mockZod } = vi.hoisted(() => {
  const zchain = () => {
    const fn = vi.fn().mockReturnThis();
    const methods = ['min', 'max', 'optional', 'nullable', 'default', 'describe',
      'refine', 'transform', 'pipe', 'enum', 'email', 'url', 'cuid', 'uuid',
      'nonempty', 'readonly', 'array', 'record', 'pick', 'omit', 'partial',
      'required', 'brand', 'catch', 'output', 'input', 'and', 'or'];
    for (const m of methods) { (fn as Record<string, unknown>)[m] = vi.fn().mockReturnThis(); }
    return fn;
  };
  return {
    mockZod: {
      z: {
        object: vi.fn().mockImplementation(() => zchain()),
        string: () => zchain(),
        boolean: () => zchain(),
        number: () => zchain(),
        array: vi.fn().mockImplementation(() => zchain()),
        record: vi.fn().mockImplementation(() => zchain()),
        enum: vi.fn().mockImplementation(() => zchain()),
        unknown: () => zchain(),
      },
    },
  };
});

const { mockCreateId } = vi.hoisted(() => {
  let counter = 0;
  return {
    mockCreateId: () => `mock-id-${++counter}`,
  };
});

vi.mock('zod', () => mockZod);

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  LibsqlConversationStore: vi.fn(),
  toMastraSafeIdentifier: vi.fn().mockImplementation((id: string) => id),
  readOperationalMemoryState: vi.fn().mockResolvedValue({}),
  withTimeout: vi.fn().mockImplementation(async (p: Promise<unknown>) => p),
  WorkspaceEmbedderId: { Claude40Sonnet: 'claude-4-sonnet' },
}));

const { mockParseJsonBody, mockJsonResponse } = vi.hoisted(() => ({
  mockParseJsonBody: vi.fn((bodyText: string) => {
    if (!bodyText || bodyText.trim() === '{}' || bodyText.trim() === '') return {};
    try { return JSON.parse(bodyText); } catch { return {}; }
  }),
  mockJsonResponse: vi.fn((body: unknown, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  })),
}));

vi.mock('../helpers', () => ({
  parseJsonBody: mockParseJsonBody,
  jsonResponse: mockJsonResponse,
  normalizeOptionalText: vi.fn().mockReturnValue(null),
  normalizeJsonText: vi.fn().mockReturnValue(null),
  summarizeHealthcheckThreadMessage: vi.fn().mockResolvedValue(''),
  extractLatestHealthcheckMessagePreview: vi.fn().mockReturnValue(''),
  summarizeActiveItems: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../../utils/id', () => ({
  createId: mockCreateId,
}));

vi.mock('../../../capabilities/runtime', () => ({
  reloadAgentIfLoaded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../routes/mcp-helpers', () => ({
  reloadAgentMcp: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../communication/provider-loader', () => ({
  parseProviderCredentials: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../encryption/crypto', () => ({
  encryptSecret: vi.fn().mockImplementation((s: string) => `encrypted:${s}`),
}));

vi.mock('../schemas/discord', () => ({
  discordProviderDeleteSignalSchema: {
    parse: vi.fn().mockImplementation((x) => x),
  },
}));

vi.mock('node:crypto', () => ({
  createHash: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ digest: vi.fn((enc?: string) => enc === 'hex' ? 'sig' : Buffer.alloc(0)) }) }),
  timingSafeEqual: vi.fn().mockReturnValue(true),
}));

// ─── Mock db (chainable drizzle) ────────────────────────────────────────────

function makeChain(values: Record<string, unknown>) {
  return {
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([values]),
  };
}

function createMockDb() {
  return {
    query: {
      agentProviders: {
        findFirst: vi.fn(),
      },
      agentMcpConfigs: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      mcpServerConfigs: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockImplementation(() => makeChain({})),
    update: vi.fn().mockImplementation(() => makeChain({})),
    delete: vi.fn().mockImplementation(() => makeChain({})),
  };
}

// ─── Test helpers ────────────────────────────────────────────────────────────

function createMockHttpServer() {
  const routes: unknown[] = [];
  return {
    registerRoute: vi.fn((route: unknown) => routes.push(route)),
    _routes: routes as Array<{ method: string; path: string; handler: (req: { bodyText: string }) => Promise<unknown> }>,
  };
}

function getHandler(httpServer: ReturnType<typeof createMockHttpServer>, path: string) {
  const match = httpServer._routes.find((r) => r.path === path);
  if (!match) throw new Error('Route not found: ' + path);
  return match.handler;
}

function makeRequest(body: Record<string, unknown>) {
  return { bodyText: JSON.stringify(body) };
}

function parseBody(response: { status: number; body: string }) {
  return JSON.parse(response.body);
}

function resetMocks() {
  vi.clearAllMocks();
  mockParseJsonBody.mockClear();
  mockJsonResponse.mockClear();
}

describe('registerAgentProviderMcpRoutes', () => {
  let httpServer: ReturnType<typeof createMockHttpServer>;
  let db: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    httpServer = createMockHttpServer();
    db = createMockDb();
    resetMocks();
  });

  // ─── Route registration ───────────────────────────────────────────────────

  describe('route registration', () => {
    it('registers all 8 routes', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      const paths = httpServer._routes.map((r) => r.path);
      expect(paths).toContain('/admin/agent-provider/upsert');
      expect(paths).toContain('/admin/agent-provider/delete');
      expect(paths).toContain('/admin/agent-mcp/create');
      expect(paths).toContain('/admin/agent-mcp/update');
      expect(paths).toContain('/admin/agent-mcp/delete');
      expect(paths).toContain('/admin/agent-mcp/assign');
      expect(paths).toContain('/admin/agent-mcp/set-active');
      expect(paths).toContain('/admin/agent-mcp/detach');
    });
  });

  // ─── POST /admin/agent-provider/upsert ────────────────────────────────────

  describe('POST /admin/agent-provider/upsert', () => {
    it('inserts new provider and returns 200', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.query.agentProviders.findFirst.mockResolvedValueOnce(null);

      const response = await getHandler(httpServer, '/admin/agent-provider/upsert')(
        makeRequest({ agentId: 'agent-1', providerType: 'openai', credentials: { key: 'secret' } }),
      ) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true, agentId: 'agent-1', providerType: 'openai' });
    });

    it('updates existing provider and returns 200', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.query.agentProviders.findFirst.mockResolvedValueOnce({ id: 'existing-id', agentId: 'agent-1', providerType: 'openai', encryptedCredentials: '', secret: null, isActive: true });

      const response = await getHandler(httpServer, '/admin/agent-provider/upsert')(
        makeRequest({ agentId: 'agent-1', providerType: 'openai', credentials: { key: 'new-secret' } }),
      ) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true });
    });

    it('handles discord empty-token delete', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });

      const response = await getHandler(httpServer, '/admin/agent-provider/upsert')(
        makeRequest({ agentId: 'agent-1', providerType: 'discord', credentials: { token: '  ' } }),
      ) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true });
    });

    it('returns 500 when db throws', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.query.agentProviders.findFirst.mockRejectedValueOnce(new Error('DB error'));

      const response = await getHandler(httpServer, '/admin/agent-provider/upsert')(
        makeRequest({ agentId: 'agent-1', providerType: 'openai', credentials: {} }),
      ) as { status: number; body: string };

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB error');
    });
  });

  // ─── POST /admin/agent-provider/delete ───────────────────────────────────

  describe('POST /admin/agent-provider/delete', () => {
    it('deletes provider and returns 200', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });

      const response = await getHandler(httpServer, '/admin/agent-provider/delete')(
        makeRequest({ agentId: 'agent-1', providerType: 'openai' }),
      ) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true });
    });

    it('returns 500 when db throws', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.delete.mockImplementationOnce(() => ({ where: vi.fn().mockRejectedValueOnce(new Error('DB delete failed')) }));

      const response = await getHandler(httpServer, '/admin/agent-provider/delete')(
        makeRequest({ agentId: 'agent-1', providerType: 'openai' }),
      ) as { status: number; body: string };

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB delete failed');
    });
  });

  // ─── POST /admin/agent-mcp/create ─────────────────────────────────────────

  describe('POST /admin/agent-mcp/create', () => {
    it('creates server and config, returns 201', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });

      const response = await getHandler(httpServer, '/admin/agent-mcp/create')(
        makeRequest({ agentId: 'agent-1', name: 'Test Server', transport: 'stdio', command: 'node', isActive: true }),
      ) as { status: number; body: string };

      expect(response.status).toBe(201);
      expect(parseBody(response)).toMatchObject({ success: true, agentId: 'agent-1' });
      expect(parseBody(response).configId).toBeDefined();
      expect(parseBody(response).serverId).toBeDefined();
    });

    it('returns 500 when db throws', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.insert.mockImplementationOnce(() => ({ values: vi.fn().mockRejectedValueOnce(new Error('DB insert failed')) }));

      const response = await getHandler(httpServer, '/admin/agent-mcp/create')(
        makeRequest({ agentId: 'agent-1', name: 'Test Server', transport: 'stdio' }),
      ) as { status: number; body: string };

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB insert failed');
    });
  });

  // ─── POST /admin/agent-mcp/update ──────────────────────────────────────────

  describe('POST /admin/agent-mcp/update', () => {
    it('updates server and config, returns 200', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });

      const response = await getHandler(httpServer, '/admin/agent-mcp/update')(
        makeRequest({ agentId: 'agent-1', serverId: 'srv-1', configId: 'cfg-1', name: 'Updated', transport: 'stdio' }),
      ) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true });
    });

    it('returns 500 when db throws', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.update.mockImplementationOnce(() => ({ set: vi.fn().mockReturnThis(), where: vi.fn().mockRejectedValueOnce(new Error('DB update failed')) }));

      const response = await getHandler(httpServer, '/admin/agent-mcp/update')(
        makeRequest({ agentId: 'agent-1', serverId: 'srv-1', configId: 'cfg-1', name: 'Updated', transport: 'stdio' }),
      ) as { status: number; body: string };

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB update failed');
    });
  });

  // ─── POST /admin/agent-mcp/delete ──────────────────────────────────────────

  describe('POST /admin/agent-mcp/delete', () => {
    it('deletes config and server when no links remain, returns 200', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.query.agentMcpConfigs.findMany.mockResolvedValueOnce([]);

      const response = await getHandler(httpServer, '/admin/agent-mcp/delete')(
        makeRequest({ agentId: 'agent-1', configId: 'cfg-1', serverId: 'srv-1' }),
      ) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true });
    });

    it('returns 500 when db throws', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.delete.mockImplementationOnce(() => ({ where: vi.fn().mockRejectedValueOnce(new Error('DB delete failed')) }));

      const response = await getHandler(httpServer, '/admin/agent-mcp/delete')(
        makeRequest({ agentId: 'agent-1', configId: 'cfg-1', serverId: 'srv-1' }),
      ) as { status: number; body: string };

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB delete failed');
    });
  });

  // ─── POST /admin/agent-mcp/assign ──────────────────────────────────────────

  describe('POST /admin/agent-mcp/assign', () => {
    it('assigns new config, returns 201', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.query.agentMcpConfigs.findFirst.mockResolvedValueOnce(null);

      const response = await getHandler(httpServer, '/admin/agent-mcp/assign')(
        makeRequest({ agentId: 'agent-1', serverId: 'srv-1', isActive: true }),
      ) as { status: number; body: string };

      expect(response.status).toBe(201);
      expect(parseBody(response)).toMatchObject({ success: true });
    });

    it('updates existing assignment, returns 200', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.query.agentMcpConfigs.findFirst.mockResolvedValueOnce({ id: 'existing-cfg', agentId: 'agent-1', serverId: 'srv-1', isActive: 0, createdAt: '', updatedAt: '' });

      const response = await getHandler(httpServer, '/admin/agent-mcp/assign')(
        makeRequest({ agentId: 'agent-1', serverId: 'srv-1', isActive: true }),
      ) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true });
    });

    it('returns 500 when db throws', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.query.agentMcpConfigs.findFirst.mockRejectedValueOnce(new Error('DB query failed'));

      const response = await getHandler(httpServer, '/admin/agent-mcp/assign')(
        makeRequest({ agentId: 'agent-1', serverId: 'srv-1', isActive: true }),
      ) as { status: number; body: string };

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB query failed');
    });
  });

  // ─── POST /admin/agent-mcp/set-active ──────────────────────────────────────

  describe('POST /admin/agent-mcp/set-active', () => {
    it('sets config active state, returns 200', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });

      const response = await getHandler(httpServer, '/admin/agent-mcp/set-active')(
        makeRequest({ agentId: 'agent-1', configId: 'cfg-1', isActive: true }),
      ) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true, isActive: true });
    });

    it('returns 500 when db throws', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.update.mockImplementationOnce(() => ({ set: vi.fn().mockReturnThis(), where: vi.fn().mockRejectedValueOnce(new Error('DB update failed')) }));

      const response = await getHandler(httpServer, '/admin/agent-mcp/set-active')(
        makeRequest({ agentId: 'agent-1', configId: 'cfg-1', isActive: true }),
      ) as { status: number; body: string };

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB update failed');
    });
  });

  // ─── POST /admin/agent-mcp/detach ─────────────────────────────────────────

  describe('POST /admin/agent-mcp/detach', () => {
    it('detaches config, returns 200', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.query.agentMcpConfigs.findFirst.mockResolvedValueOnce({ id: 'cfg-1', agentId: 'agent-1', serverId: 'srv-1', isActive: 1, createdAt: '', updatedAt: '' });

      const response = await getHandler(httpServer, '/admin/agent-mcp/detach')(
        makeRequest({ agentId: 'agent-1', configId: 'cfg-1' }),
      ) as { status: number; body: string };

      expect(response.status).toBe(200);
      expect(parseBody(response)).toMatchObject({ success: true });
    });

    it('returns 404 when config not found', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.query.agentMcpConfigs.findFirst.mockResolvedValueOnce(null);

      const response = await getHandler(httpServer, '/admin/agent-mcp/detach')(
        makeRequest({ agentId: 'agent-1', configId: 'cfg-notfound' }),
      ) as { status: number; body: string };

      expect(response.status).toBe(404);
      expect(parseBody(response).error).toContain('not found');
    });

    it('returns 500 when db throws', async () => {
      const { registerAgentProviderMcpRoutes } = await import('./provider-mcp');
      registerAgentProviderMcpRoutes({ httpServer, db, loaderConfig: {} });
      db.query.agentMcpConfigs.findFirst.mockRejectedValueOnce(new Error('DB query failed'));

      const response = await getHandler(httpServer, '/admin/agent-mcp/detach')(
        makeRequest({ agentId: 'agent-1', configId: 'cfg-1' }),
      ) as { status: number; body: string };

      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB query failed');
    });
  });
});
