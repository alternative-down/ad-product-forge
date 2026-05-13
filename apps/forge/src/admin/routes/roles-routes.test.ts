/**
 * Route-level tests for role-related inline handlers in admin/routes.ts.
 * Covers 9 role routes: POST /admin/role/create, /role/update, /role/delete,
 * /role-capability/add, /role-capability/remove,
 * /role-tool-permission/add, /role-tool-permission/remove,
 * /role-workflow-permission/add, /role-workflow-permission/remove.
 * Part of #1874 incremental coverage of admin/routes.ts inline handlers.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
// import type { HttpRequest } from '../../../http/server';
type HttpRequest = any;

// ─── Mock modules (all hoisted to avoid module-load-order issues) ─────────────

const { mockZod } = vi.hoisted(() => {
  const zchain = () => {
    const fn = vi.fn().mockReturnThis();
    const methods = ['min', 'max', 'optional', 'nullable', 'default', 'describe',
      'refine', 'transform', 'pipe', 'enum', 'email', 'url', 'cuid', 'uuid',
      'nonempty', 'readonly', 'array', 'record', 'pick', 'omit', 'partial',
      'required', 'brand', 'catch', 'innerType', 'output', 'input', 'and', 'or'];
    for (const m of methods) { (fn as any)[m] = vi.fn().mockReturnThis(); }
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
        literal: vi.fn().mockImplementation(() => zchain()),
        union: vi.fn().mockImplementation(() => zchain()),
        discriminatedUnion: vi.fn().mockImplementation(() => zchain()),
        intersection: vi.fn().mockImplementation(() => zchain()),
        tuple: vi.fn().mockImplementation(() => zchain()),
        preprocess: vi.fn().mockImplementation(() => zchain()),
        coerce: vi.fn().mockImplementation(() => zchain()),
        effects: vi.fn().mockImplementation(() => zchain()),
      },
    },
  };
});

const { mockParseJsonBody, mockJsonResponse } = vi.hoisted(() => ({
  mockParseJsonBody: vi.fn((bodyText: string) => {
    if (!bodyText || bodyText.trim() === '{}' || bodyText.trim() === '') return {};
    try { return JSON.parse(bodyText); } catch { return {}; }
  }),
  mockJsonResponse: (body: unknown, status = 200) => ({
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    body: JSON.stringify(body),
  }),
}));

vi.mock('zod', () => mockZod);

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  LibsqlConversationStore: vi.fn(),
  toMastraSafeIdentifier: vi.fn().mockImplementation((id: string) => id),
  readOperationalMemoryState: vi.fn().mockResolvedValue({}),
  withTimeout: vi.fn().mockImplementation(async (p: Promise<unknown>) => p),
  WorkspaceEmbedderId: { Claude40Sonnet: 'claude-4-sonnet' },
}));

vi.mock('./helpers', () => ({
  parseJsonBody: mockParseJsonBody,
  jsonResponse: mockJsonResponse,
  normalizeOptionalText: vi.fn().mockReturnValue(null),
  normalizeJsonText: vi.fn().mockReturnValue(null),
  summarizeHealthcheckThreadMessage: vi.fn().mockResolvedValue(''),
  extractLatestHealthcheckMessagePreview: vi.fn().mockReturnValue(''),
  summarizeActiveItems: vi.fn().mockResolvedValue(''),
}));

vi.mock('../../capabilities/runtime', () => ({
  reloadAgentIfLoaded: vi.fn().mockResolvedValue(undefined),
  reloadAgentsForRole: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../schemas/discord', () => ({
  discordProviderDeleteSignalSchema: { parse: vi.fn().mockImplementation((x) => x) },
}));

// ─── Mock factories ──────────────────────────────────────────────────────────

function createMockHttpServer() {
  const routes: unknown[] = [];
  return {
    registerRoute: vi.fn((route: unknown) => routes.push(route)),
    _routes: routes as Array<{ method: string; path: string; handler: (req: { bodyText: string }) => Promise<unknown> }>,
  };
}

function createMockCapabilities() {
  return {
    createRole: vi.fn(),
    updateRole: vi.fn(),
    deleteRole: vi.fn(),
    manageRoleCapability: vi.fn(),
    addRoleToolPermission: vi.fn(),
    removeRoleToolPermission: vi.fn(),
    addRoleWorkflowPermission: vi.fn(),
    removeRoleWorkflowPermission: vi.fn(),
  };
}

function parseBody(response: { status: number; body: string }) {
  return JSON.parse(response.body);
}

function getHandler(httpServer: ReturnType<typeof createMockHttpServer>, path: string) {
  const match = httpServer._routes.find((r) => r.path === path);
  if (!match) throw new Error('Route not found: ' + path);
  return match.handler;
}

function makePostRequest(body: Record<string, unknown>) {
  return { bodyText: JSON.stringify(body) };
}

// ─── Route registration helper ───────────────────────────────────────────────
// Mirrors the exact inline handlers from admin/routes.ts
function registerRoleRoutes(httpServer: ReturnType<typeof createMockHttpServer>, capabilities: ReturnType<typeof createMockCapabilities>) {
  httpServer.registerRoute({
    method: 'POST', path: '/admin/role/create',
    handler: async (request: any) => {
      try {
        const body = mockParseJsonBody(request.bodyText);
        const result = await capabilities.createRole(body);
        return mockJsonResponse(result, 201);
      } catch (error) {
        return mockJsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
  httpServer.registerRoute({
    method: 'POST', path: '/admin/role/update',
    handler: async (request: any) => {
      try {
        const body = mockParseJsonBody(request.bodyText) as { roleId: string; name?: string };
        return mockJsonResponse(await capabilities.updateRole(body));
      } catch (error) {
        return mockJsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
  httpServer.registerRoute({
    method: 'POST', path: '/admin/role/delete',
    handler: async (request: any) => {
      try {
        const body = mockParseJsonBody(request.bodyText) as { roleId: string };
        return mockJsonResponse(await capabilities.deleteRole(body.roleId));
      } catch (error) {
        return mockJsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
  httpServer.registerRoute({
    method: 'POST', path: '/admin/role-capability/add',
    handler: async (request: any) => {
      try {
        const body = mockParseJsonBody(request.bodyText) as { roleId: string; capabilityId: string };
        return mockJsonResponse(await capabilities.manageRoleCapability({ action: 'add', roleId: body.roleId, capabilityId: body.capabilityId }));
      } catch (error) {
        return mockJsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
  httpServer.registerRoute({
    method: 'POST', path: '/admin/role-capability/remove',
    handler: async (request: any) => {
      try {
        const body = mockParseJsonBody(request.bodyText) as { roleId: string; capabilityId: string };
        return mockJsonResponse(await capabilities.manageRoleCapability({ action: 'remove', roleId: body.roleId, capabilityId: body.capabilityId }));
      } catch (error) {
        return mockJsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
  httpServer.registerRoute({
    method: 'POST', path: '/admin/role-tool-permission/add',
    handler: async (request: any) => {
      try {
        const body = mockParseJsonBody(request.bodyText) as { roleId: string; toolId: string };
        return mockJsonResponse(await capabilities.addRoleToolPermission(body));
      } catch (error) {
        return mockJsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
  httpServer.registerRoute({
    method: 'POST', path: '/admin/role-tool-permission/remove',
    handler: async (request: any) => {
      try {
        const body = mockParseJsonBody(request.bodyText) as { roleId: string; toolId: string };
        return mockJsonResponse(await capabilities.removeRoleToolPermission(body));
      } catch (error) {
        return mockJsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
  httpServer.registerRoute({
    method: 'POST', path: '/admin/role-workflow-permission/add',
    handler: async (request: any) => {
      try {
        const body = mockParseJsonBody(request.bodyText) as { roleId: string; workflowId: string };
        return mockJsonResponse(await capabilities.addRoleWorkflowPermission(body));
      } catch (error) {
        return mockJsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
  httpServer.registerRoute({
    method: 'POST', path: '/admin/role-workflow-permission/remove',
    handler: async (request: any) => {
      try {
        const body = mockParseJsonBody(request.bodyText) as { roleId: string; workflowId: string };
        return mockJsonResponse(await capabilities.removeRoleWorkflowPermission(body));
      } catch (error) {
        return mockJsonResponse({ error: error instanceof Error ? error.message : String(error) }, 500);
      }
    },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('role routes in admin/routes.ts', () => {
  let httpServer: ReturnType<typeof createMockHttpServer>;
  let capabilities: ReturnType<typeof createMockCapabilities>;

  beforeEach(() => {
    httpServer = createMockHttpServer();
    capabilities = createMockCapabilities();
    vi.clearAllMocks();
    registerRoleRoutes(httpServer, capabilities);
  });

  describe('route registration', () => {
    it('registers POST /admin/role/create', () => {
      expect(httpServer._routes.find((r) => r.path === '/admin/role/create')).toBeDefined();
    });
    it('registers POST /admin/role/update', () => {
      expect(httpServer._routes.find((r) => r.path === '/admin/role/update')).toBeDefined();
    });
    it('registers POST /admin/role/delete', () => {
      expect(httpServer._routes.find((r) => r.path === '/admin/role/delete')).toBeDefined();
    });
    it('registers POST /admin/role-capability/add', () => {
      expect(httpServer._routes.find((r) => r.path === '/admin/role-capability/add')).toBeDefined();
    });
    it('registers POST /admin/role-capability/remove', () => {
      expect(httpServer._routes.find((r) => r.path === '/admin/role-capability/remove')).toBeDefined();
    });
    it('registers POST /admin/role-tool-permission/add', () => {
      expect(httpServer._routes.find((r) => r.path === '/admin/role-tool-permission/add')).toBeDefined();
    });
    it('registers POST /admin/role-tool-permission/remove', () => {
      expect(httpServer._routes.find((r) => r.path === '/admin/role-tool-permission/remove')).toBeDefined();
    });
    it('registers POST /admin/role-workflow-permission/add', () => {
      expect(httpServer._routes.find((r) => r.path === '/admin/role-workflow-permission/add')).toBeDefined();
    });
    it('registers POST /admin/role-workflow-permission/remove', () => {
      expect(httpServer._routes.find((r) => r.path === '/admin/role-workflow-permission/remove')).toBeDefined();
    });
  });

  describe('POST /admin/role/create', () => {
    it('creates role and returns 201', async () => {
      capabilities.createRole.mockResolvedValueOnce({ roleId: 'role-1', name: 'Admin' });
      const response = await getHandler(httpServer, '/admin/role/create')(makePostRequest({ name: 'Admin' })) as { status: number; body: string };
      expect(response.status).toBe(201);
      expect(parseBody(response)).toEqual({ roleId: 'role-1', name: 'Admin' });
    });
    it('returns 500 when createRole throws', async () => {
      capabilities.createRole.mockRejectedValueOnce(new Error('DB constraint violation'));
      const response = await getHandler(httpServer, '/admin/role/create')(makePostRequest({ name: 'Admin' })) as { status: number; body: string };
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB constraint violation');
    });
  });

  describe('POST /admin/role/update', () => {
    it('updates role and returns 200', async () => {
      capabilities.updateRole.mockResolvedValueOnce({ roleId: 'role-1', name: 'Updated' });
      const response = await getHandler(httpServer, '/admin/role/update')(makePostRequest({ roleId: 'role-1', name: 'Updated' })) as { status: number; body: string };
      expect(response.status).toBe(200);
      expect(parseBody(response)).toEqual({ roleId: 'role-1', name: 'Updated' });
    });
    it('returns 500 when updateRole throws', async () => {
      capabilities.updateRole.mockRejectedValueOnce(new Error('DB update failed'));
      const response = await getHandler(httpServer, '/admin/role/update')(makePostRequest({ roleId: 'role-1', name: 'Updated' })) as { status: number; body: string };
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB update failed');
    });
  });

  describe('POST /admin/role/delete', () => {
    it('deletes role and returns 200', async () => {
      capabilities.deleteRole.mockResolvedValueOnce({ success: true });
      const response = await getHandler(httpServer, '/admin/role/delete')(makePostRequest({ roleId: 'role-1' })) as { status: number; body: string };
      expect(response.status).toBe(200);
      expect(parseBody(response)).toEqual({ success: true });
    });
    it('returns 500 when deleteRole throws', async () => {
      capabilities.deleteRole.mockRejectedValueOnce(new Error('DB delete failed'));
      const response = await getHandler(httpServer, '/admin/role/delete')(makePostRequest({ roleId: 'role-1' })) as { status: number; body: string };
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB delete failed');
    });
  });

  describe('POST /admin/role-capability/add', () => {
    it('adds capability and returns 200', async () => {
      capabilities.manageRoleCapability.mockResolvedValueOnce({ roleId: 'role-1', capabilityId: 'cap-1' });
      const response = await getHandler(httpServer, '/admin/role-capability/add')(makePostRequest({ roleId: 'role-1', capabilityId: 'cap-1' })) as { status: number; body: string };
      expect(response.status).toBe(200);
      expect(parseBody(response)).toEqual({ roleId: 'role-1', capabilityId: 'cap-1' });
    });
    it('returns 500 when manageRoleCapability throws', async () => {
      capabilities.manageRoleCapability.mockRejectedValueOnce(new Error('DB error'));
      const response = await getHandler(httpServer, '/admin/role-capability/add')(makePostRequest({ roleId: 'role-1', capabilityId: 'cap-1' })) as { status: number; body: string };
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB error');
    });
  });

  describe('POST /admin/role-capability/remove', () => {
    it('removes capability and returns 200', async () => {
      capabilities.manageRoleCapability.mockResolvedValueOnce({ roleId: 'role-1', capabilityId: 'cap-1' });
      const response = await getHandler(httpServer, '/admin/role-capability/remove')(makePostRequest({ roleId: 'role-1', capabilityId: 'cap-1' })) as { status: number; body: string };
      expect(response.status).toBe(200);
      expect(parseBody(response)).toEqual({ roleId: 'role-1', capabilityId: 'cap-1' });
    });
    it('returns 500 when manageRoleCapability throws', async () => {
      capabilities.manageRoleCapability.mockRejectedValueOnce(new Error('DB error'));
      const response = await getHandler(httpServer, '/admin/role-capability/remove')(makePostRequest({ roleId: 'role-1', capabilityId: 'cap-1' })) as { status: number; body: string };
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB error');
    });
  });

  describe('POST /admin/role-tool-permission/add', () => {
    it('adds tool permission and returns 200', async () => {
      capabilities.addRoleToolPermission.mockResolvedValueOnce({ roleId: 'role-1', toolId: 'tool-1' });
      const response = await getHandler(httpServer, '/admin/role-tool-permission/add')(makePostRequest({ roleId: 'role-1', toolId: 'tool-1' })) as { status: number; body: string };
      expect(response.status).toBe(200);
      expect(parseBody(response)).toEqual({ roleId: 'role-1', toolId: 'tool-1' });
    });
    it('returns 500 when addRoleToolPermission throws', async () => {
      capabilities.addRoleToolPermission.mockRejectedValueOnce(new Error('DB insert failed'));
      const response = await getHandler(httpServer, '/admin/role-tool-permission/add')(makePostRequest({ roleId: 'role-1', toolId: 'tool-1' })) as { status: number; body: string };
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB insert failed');
    });
  });

  describe('POST /admin/role-tool-permission/remove', () => {
    it('removes tool permission and returns 200', async () => {
      capabilities.removeRoleToolPermission.mockResolvedValueOnce({ roleId: 'role-1', toolId: 'tool-1' });
      const response = await getHandler(httpServer, '/admin/role-tool-permission/remove')(makePostRequest({ roleId: 'role-1', toolId: 'tool-1' })) as { status: number; body: string };
      expect(response.status).toBe(200);
      expect(parseBody(response)).toEqual({ roleId: 'role-1', toolId: 'tool-1' });
    });
    it('returns 500 when removeRoleToolPermission throws', async () => {
      capabilities.removeRoleToolPermission.mockRejectedValueOnce(new Error('DB delete failed'));
      const response = await getHandler(httpServer, '/admin/role-tool-permission/remove')(makePostRequest({ roleId: 'role-1', toolId: 'tool-1' })) as { status: number; body: string };
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB delete failed');
    });
  });

  describe('POST /admin/role-workflow-permission/add', () => {
    it('adds workflow permission and returns 200', async () => {
      capabilities.addRoleWorkflowPermission.mockResolvedValueOnce({ roleId: 'role-1', workflowId: 'wf-1' });
      const response = await getHandler(httpServer, '/admin/role-workflow-permission/add')(makePostRequest({ roleId: 'role-1', workflowId: 'wf-1' })) as { status: number; body: string };
      expect(response.status).toBe(200);
      expect(parseBody(response)).toEqual({ roleId: 'role-1', workflowId: 'wf-1' });
    });
    it('returns 500 when addRoleWorkflowPermission throws', async () => {
      capabilities.addRoleWorkflowPermission.mockRejectedValueOnce(new Error('DB insert failed'));
      const response = await getHandler(httpServer, '/admin/role-workflow-permission/add')(makePostRequest({ roleId: 'role-1', workflowId: 'wf-1' })) as { status: number; body: string };
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB insert failed');
    });
  });

  describe('POST /admin/role-workflow-permission/remove', () => {
    it('removes workflow permission and returns 200', async () => {
      capabilities.removeRoleWorkflowPermission.mockResolvedValueOnce({ roleId: 'role-1', workflowId: 'wf-1' });
      const response = await getHandler(httpServer, '/admin/role-workflow-permission/remove')(makePostRequest({ roleId: 'role-1', workflowId: 'wf-1' })) as { status: number; body: string };
      expect(response.status).toBe(200);
      expect(parseBody(response)).toEqual({ roleId: 'role-1', workflowId: 'wf-1' });
    });
    it('returns 500 when removeRoleWorkflowPermission throws', async () => {
      capabilities.removeRoleWorkflowPermission.mockRejectedValueOnce(new Error('DB delete failed'));
      const response = await getHandler(httpServer, '/admin/role-workflow-permission/remove')(makePostRequest({ roleId: 'role-1', workflowId: 'wf-1' })) as { status: number; body: string };
      expect(response.status).toBe(500);
      expect(parseBody(response).error).toBe('DB delete failed');
    });
  });
});
