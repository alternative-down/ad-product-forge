/**
 * Unit tests for admin/routes/agents/detail-read.ts.
 * 9 route handlers (all GET): base, steps, conversations, memory, metrics,
 * contracts, mcp-servers, schedules, notifications.
 * Zero prior coverage.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── All mocks hoisted ───────────────────────────────────────────────────────

const { mockJsonResponse } = vi.hoisted(() => ({
  mockJsonResponse: vi.fn((body: unknown, status?: number) => ({
    status: status ?? 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })),
}));

const mockGetAgent = vi.fn();
const mockListConversations = vi.fn();
const mockGetAgentRuntimeMemory = vi.fn();

vi.mock('../../index', () => ({
  jsonResponse: mockJsonResponse as any,
}));

vi.mock('../../read-model/agents', () => ({
  getAgent: mockGetAgent,
  listAgentRecentConversations: mockListConversations,
  getAgentRuntimeMemory: mockGetAgentRuntimeMemory,
}));

// ─── Import after mocks ────────────────────────────────────────────────────

import {
  registerAgentBaseRoutes,
  registerAgentStepsRoutes,
  registerAgentConversationsRoutes,
  registerAgentMemoryRoutes,
  registerAgentMetricsRoutes,
  registerAgentContractRoutes,
  registerAgentMcpRoutes,
  registerAgentSchedulesRoutes,
  registerAgentNotificationsRoutes,
} from './detail-read';

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeHttpServer() {
  const routes: Array<{ method: string; path: string; handler: any }> = [];
  return {
    registerRoute(route: { method: string; path: string; handler: any }) {
      routes.push(route);
      return () => {};
    },
    getRoutes() {
      return routes;
    },
  };
}

function makeRequest(path: string, query: Map<string, string> = new Map()) {
  return { path, query };
}

function parseBody(response: { body: string }) {
  return JSON.parse(response.body);
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('registerAgentBaseRoutes', () => {
  let httpServer: ReturnType<typeof makeHttpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse.mockImplementation((body: unknown, status?: number) => ({
      status: status ?? 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    httpServer = makeHttpServer();
  });

  it('registers GET /admin/agents/:agentId', () => {
    registerAgentBaseRoutes(httpServer, mockGetAgent);
    const route = httpServer.getRoutes().find((r) => r.path.includes('/admin/agents/'));
    expect(route).toBeDefined();
    expect(route!.method).toBe('GET');
    expect(route!.path).toBe('/admin/agents/:agentId');
  });

  it('returns 400 when agentId is missing from path', async () => {
    registerAgentBaseRoutes(httpServer, mockGetAgent);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/'));
    expect(response.status).toBe(400);
    expect(parseBody(response)).toHaveProperty('error', 'Missing agentId');
  });

  it('returns 404 when agent not found', async () => {
    mockGetAgent.mockResolvedValue(null);
    registerAgentBaseRoutes(httpServer, mockGetAgent);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/ghost-agent'));
    expect(response.status).toBe(404);
    expect(parseBody(response)).toHaveProperty('error', 'Agent not found: ghost-agent');
  });

  it('returns agent JSON on success', async () => {
    const agent = { id: 'agent-1', name: 'Test Agent', createdAt: Date.now() };
    mockGetAgent.mockResolvedValue(agent);
    registerAgentBaseRoutes(httpServer, mockGetAgent);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/agent-1'));
    expect(response.status).toBe(200);
    expect(parseBody(response)).toMatchObject({ id: 'agent-1' });
  });
});

describe('registerAgentStepsRoutes', () => {
  let httpServer: ReturnType<typeof makeHttpServer>;
  let mockDb: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse.mockImplementation((body: unknown, status?: number) => ({
      status: status ?? 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    httpServer = makeHttpServer();
    mockDb = {
      query: {
        agentExecutionSteps: {
          findMany: vi
            .fn()
            .mockResolvedValue([{ id: 'step-1', agentId: 'agent-1', createdAt: Date.now() }]),
        },
      },
    };
  });

  it('registers GET /admin/agents/:agentId/steps', () => {
    registerAgentStepsRoutes(httpServer, mockDb);
    expect(httpServer.getRoutes()[0].path).toBe('/admin/agents/:agentId/steps');
  });

  it('returns 400 when agentId is missing', async () => {
    registerAgentStepsRoutes(httpServer, mockDb);
    const response = await httpServer.getRoutes()[0].handler(makeRequest('/admin/agents/'));
    expect(response.status).toBe(400);
  });

  it('queries DB with default limit 10 and offset 0', async () => {
    registerAgentStepsRoutes(httpServer, mockDb);
    const route = httpServer.getRoutes()[0];
    await route.handler(makeRequest('/admin/agents/agent-1/steps'));
    expect(mockDb.query.agentExecutionSteps.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10, offset: 0 }),
    );
  });

  it('uses query params for limit and offset', async () => {
    registerAgentStepsRoutes(httpServer, mockDb);
    const route = httpServer.getRoutes()[0];
    const query = new Map([
      ['limit', '20'],
      ['offset', '5'],
    ]);
    await route.handler(makeRequest('/admin/agents/agent-1/steps', query));
    expect(mockDb.query.agentExecutionSteps.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 5 }),
    );
  });

  it('returns items and hasMore flag', async () => {
    registerAgentStepsRoutes(httpServer, mockDb);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/agent-1/steps'));
    expect(response.status).toBe(200);
    const body = parseBody(response);
    expect(body).toHaveProperty('items');
    expect(body).toHaveProperty('hasMore');
  });
});

describe('registerAgentConversationsRoutes', () => {
  let httpServer: ReturnType<typeof makeHttpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse.mockImplementation((body: unknown, status?: number) => ({
      status: status ?? 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    mockListConversations.mockResolvedValue([]);
    httpServer = makeHttpServer();
  });

  it('registers GET /admin/agents/:agentId/conversations', () => {
    registerAgentConversationsRoutes(httpServer, mockListConversations);
    expect(httpServer.getRoutes()[0].path).toBe('/admin/agents/:agentId/conversations');
  });

  it('returns 400 when agentId is missing', async () => {
    registerAgentConversationsRoutes(httpServer, mockListConversations);
    const response = await httpServer.getRoutes()[0].handler(makeRequest('/admin/agents/'));
    expect(response.status).toBe(400);
  });

  it('calls listAgentRecentConversations with agentId', async () => {
    registerAgentConversationsRoutes(httpServer, mockListConversations);
    const route = httpServer.getRoutes()[0];
    await route.handler(makeRequest('/admin/agents/agent-1/conversations'));
    expect(mockListConversations).toHaveBeenCalledWith('agent-1');
  });

  it('returns conversations array on success', async () => {
    mockListConversations.mockResolvedValue([{ id: 'c1', agentId: 'agent-1' }]);
    registerAgentConversationsRoutes(httpServer, mockListConversations);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/agent-1/conversations'));
    expect(response.status).toBe(200);
    expect(parseBody(response)).toEqual([{ id: 'c1', agentId: 'agent-1' }]);
  });
});

describe('registerAgentMemoryRoutes', () => {
  let httpServer: ReturnType<typeof makeHttpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse.mockImplementation((body: unknown, status?: number) => ({
      status: status ?? 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    mockGetAgentRuntimeMemory.mockResolvedValue({ version: 1, packages: [] });
    httpServer = makeHttpServer();
  });

  it('registers GET /admin/agents/:agentId/memory', () => {
    registerAgentMemoryRoutes(httpServer, mockGetAgentRuntimeMemory);
    expect(httpServer.getRoutes()[0].path).toBe('/admin/agents/:agentId/memory');
  });

  it('returns 400 when agentId is missing', async () => {
    registerAgentMemoryRoutes(httpServer, mockGetAgentRuntimeMemory);
    const response = await httpServer.getRoutes()[0].handler(makeRequest('/admin/agents/'));
    expect(response.status).toBe(400);
  });

  it('calls getAgentRuntimeMemory with agentId', async () => {
    registerAgentMemoryRoutes(httpServer, mockGetAgentRuntimeMemory);
    const route = httpServer.getRoutes()[0];
    await route.handler(makeRequest('/admin/agents/agent-1/memory'));
    expect(mockGetAgentRuntimeMemory).toHaveBeenCalledWith('agent-1');
  });

  it('returns state on success', async () => {
    registerAgentMemoryRoutes(httpServer, mockGetAgentRuntimeMemory);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/agent-1/memory'));
    expect(response.status).toBe(200);
    expect(parseBody(response)).toHaveProperty('version', 1);
  });
});

describe('registerAgentMetricsRoutes', () => {
  let mockDb: any;
  let httpServer: ReturnType<typeof makeHttpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse.mockImplementation((body: unknown, status?: number) => ({
      status: status ?? 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    mockDb = {
      query: {
        agentExecutionSteps: {
          findMany: vi.fn().mockResolvedValue([{ id: 's1' }]),
        },
      },
    };
    httpServer = makeHttpServer();
  });

  it('registers GET /admin/agents/:agentId/metrics', () => {
    registerAgentMetricsRoutes(httpServer, mockDb);
    expect(httpServer.getRoutes()[0].path).toBe('/admin/agents/:agentId/metrics');
  });

  it('returns 400 when agentId is missing', async () => {
    registerAgentMetricsRoutes(httpServer, mockDb);
    const response = await httpServer.getRoutes()[0].handler(makeRequest('/admin/agents/'));
    expect(response.status).toBe(400);
  });

  it('returns metrics object with items on success', async () => {
    registerAgentMetricsRoutes(httpServer, mockDb);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/agent-1/metrics'));
    expect(response.status).toBe(200);
    expect(parseBody(response)).toHaveProperty('items');
  });
});

describe('registerAgentContractRoutes', () => {
  let mockDb: any;
  let httpServer: ReturnType<typeof makeHttpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse.mockImplementation((body: unknown, status?: number) => ({
      status: status ?? 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    mockDb = {
      query: {
        agentExecutionContracts: {
          findMany: vi.fn().mockResolvedValue([{ id: 'c1' }]),
        },
      },
    };
    httpServer = makeHttpServer();
  });

  it('registers GET /admin/agents/:agentId/contracts', () => {
    registerAgentContractRoutes(httpServer, mockDb);
    expect(httpServer.getRoutes()[0].path).toBe('/admin/agents/:agentId/contracts');
  });

  it('returns 400 when agentId is missing', async () => {
    registerAgentContractRoutes(httpServer, mockDb);
    const response = await httpServer.getRoutes()[0].handler(makeRequest('/admin/agents/'));
    expect(response.status).toBe(400);
  });

  it('returns items object with contracts array on success', async () => {
    registerAgentContractRoutes(httpServer, mockDb);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/agent-1/contracts'));
    expect(response.status).toBe(200);
    expect(parseBody(response)).toMatchObject({ items: [{ id: 'c1' }] });
  });
});

describe('registerAgentMcpRoutes', () => {
  let mockDb: any;
  let httpServer: ReturnType<typeof makeHttpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse.mockImplementation((body: unknown, status?: number) => ({
      status: status ?? 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    mockDb = {
      query: {
        agentMcpConfigs: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    };
    httpServer = makeHttpServer();
  });

  it('registers GET /admin/agents/:agentId/mcp-servers', () => {
    registerAgentMcpRoutes(httpServer, mockDb);
    expect(httpServer.getRoutes()[0].path).toBe('/admin/agents/:agentId/mcp-servers');
  });

  it('returns 400 when agentId is missing', async () => {
    registerAgentMcpRoutes(httpServer, mockDb);
    const response = await httpServer.getRoutes()[0].handler(makeRequest('/admin/agents/'));
    expect(response.status).toBe(400);
  });

  it('returns { servers: [] } when no MCP configs found', async () => {
    registerAgentMcpRoutes(httpServer, mockDb);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/agent-1/mcp-servers'));
    expect(response.status).toBe(200);
    expect(parseBody(response)).toEqual({ servers: [] });
  });

  it('returns { servers: [...] } when MCP configs exist', async () => {
    mockDb.query.agentMcpConfigs.findMany.mockResolvedValue([
      { id: 'link-1', agentId: 'agent-1', serverId: 'srv-1' },
    ]);
    mockDb.query.mcpServerConfigs = {
      findMany: vi
        .fn()
        .mockResolvedValue([{ id: 'srv-1', name: 'Test MCP', description: 'A test server' }]),
    };
    registerAgentMcpRoutes(httpServer, mockDb);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/agent-1/mcp-servers'));
    expect(response.status).toBe(200);
    const body = parseBody(response);
    expect(body).toHaveProperty('servers');
    expect(Array.isArray(body.servers)).toBe(true);
  });
});

describe('registerAgentSchedulesRoutes', () => {
  let mockDb: any;
  let httpServer: ReturnType<typeof makeHttpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse.mockImplementation((body: unknown, status?: number) => ({
      status: status ?? 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    mockDb = {
      query: {
        agentSchedules: {
          findMany: vi.fn().mockResolvedValue([{ id: 's1', agentId: 'agent-1' }]),
        },
      },
    };
    httpServer = makeHttpServer();
  });

  it('registers GET /admin/agents/:agentId/schedules', () => {
    registerAgentSchedulesRoutes(httpServer, mockDb);
    expect(httpServer.getRoutes()[0].path).toBe('/admin/agents/:agentId/schedules');
  });

  it('returns 400 when agentId is missing', async () => {
    registerAgentSchedulesRoutes(httpServer, mockDb);
    const response = await httpServer.getRoutes()[0].handler(makeRequest('/admin/agents/'));
    expect(response.status).toBe(400);
  });

  it('returns items object with schedules on success', async () => {
    registerAgentSchedulesRoutes(httpServer, mockDb);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/agent-1/schedules'));
    expect(response.status).toBe(200);
    expect(parseBody(response)).toMatchObject({ items: [{ id: 's1', agentId: 'agent-1' }] });
  });
});

describe('registerAgentNotificationsRoutes', () => {
  let mockDb: any;
  let httpServer: ReturnType<typeof makeHttpServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockJsonResponse.mockImplementation((body: unknown, status?: number) => ({
      status: status ?? 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));
    mockDb = {
      query: {
        agentNotifications: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              {
                id: 'n1',
                agentId: 'agent-1',
                content: 'Hello',
                createdAt: Date.now(),
                readAt: null,
              },
            ]),
        },
      },
    };
    httpServer = makeHttpServer();
  });

  it('registers GET /admin/agents/:agentId/notifications', () => {
    registerAgentNotificationsRoutes(httpServer, mockDb);
    expect(httpServer.getRoutes()[0].path).toBe('/admin/agents/:agentId/notifications');
  });

  it('returns 400 when agentId is missing', async () => {
    registerAgentNotificationsRoutes(httpServer, mockDb);
    const response = await httpServer.getRoutes()[0].handler(makeRequest('/admin/agents/'));
    expect(response.status).toBe(400);
  });

  it('returns items object with notifications on success', async () => {
    registerAgentNotificationsRoutes(httpServer, mockDb);
    const route = httpServer.getRoutes()[0];
    const response = await route.handler(makeRequest('/admin/agents/agent-1/notifications'));
    expect(response.status).toBe(200);
    expect(parseBody(response)).toHaveProperty('items');
  });
});
