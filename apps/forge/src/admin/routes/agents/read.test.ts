/**
 * Tests for admin/routes/agents/read.ts — 9 GET routes for agent admin operations
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ZodError } from 'zod';
import { registerAgentReadRoutes } from './read';

// Must mirror actual jsonResponse from ../index.ts
const mockJsonResponse = (body: unknown, status = 200) => ({
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
  body: JSON.stringify(body),
});

const createMockRequest = (query = new Map<string, string | null>()) => ({
  query,
});

describe('registerAgentReadRoutes', () => {
  let httpServer: ReturnType<typeof setupMockHttpServer>;
  let mockReadModel: ReturnType<typeof setupMockReadModel>;

  beforeEach(() => {
    httpServer = setupMockHttpServer();
    mockReadModel = setupMockReadModel();
  });

  function setupMockHttpServer() {
    const routes: Array<{ method: string; path: string; handler: (req: unknown) => unknown }> = [];
    return {
      routes,
      registerRoute: (route: { method: string; path: string; handler: (req: unknown) => unknown }) => {
        routes.push(route);
      },
    };
  }

  function setupMockReadModel() {
    return {
      listAgents: vi.fn<() => Promise<unknown>>().mockResolvedValue([{ id: 'ag_001', name: 'Alpha' }]),
      getAgent: vi.fn<(id: string) => Promise<unknown>>().mockResolvedValue({ id: 'ag_001', name: 'Alpha' }),
      listAgentRecentConversations: vi.fn<(id: string) => Promise<unknown>>().mockResolvedValue([{ id: 'conv_1' }]),
      listAgentExecutionSteps: vi.fn<(q: { agentId: string; limit?: number; offset?: number }) => Promise<unknown>>().mockResolvedValue([{ stepId: 's1' }]),
      listAgentThreadMessages: vi.fn<(p: { agentId: string; page: number; perPage: number }) => Promise<unknown>>().mockResolvedValue([{ messageId: 'm1' }]),
      listAgentLongTermMemoryThreadMessages: vi.fn<(p: { agentId: string; page: number; perPage: number }) => Promise<unknown>>().mockResolvedValue([{ messageId: 'ltm1' }]),
      getAgentRuntimeMemory: vi.fn<(id: string) => Promise<unknown>>().mockResolvedValue({ snapshot: 'memory' }),
      getAgentOmDebugExport: vi.fn<(id: string) => Promise<unknown>>().mockResolvedValue({ debug: true }),
      debugAgentLongTermMemoryRecallSearch: vi.fn<(agentId: string, opts: { query: string }) => Promise<unknown>>().mockResolvedValue([{ recall: 'result' }]),
      listAgentConversationMessages: vi.fn<(p: { agentId: string; provider: string; targetKey: string; limit?: number; offset?: number }) => Promise<unknown>>().mockResolvedValue([{ msgId: 'msg1' }]),
    };
  }

  it('registers exactly 9 GET routes', () => {
    registerAgentReadRoutes(httpServer, mockReadModel);
    const getRoutes = httpServer.routes.filter((r) => r.method === 'GET');
    expect(getRoutes).toHaveLength(9);
  });

  it('registers all expected paths', () => {
    registerAgentReadRoutes(httpServer, mockReadModel);
    const paths = httpServer.routes.map((r) => r.path);
    expect(paths).toContain('/admin/agents');
    expect(paths).toContain('/admin/agent');
    expect(paths).toContain('/admin/agent/recent-conversations');
    expect(paths).toContain('/admin/agent/execution-steps');
    expect(paths).toContain('/admin/agent/thread-messages');
    expect(paths).toContain('/admin/agent/ltm-thread-messages');
    expect(paths).toContain('/admin/agent/runtime-memory');
    expect(paths).toContain('/admin/agent/om-debug-export');
    expect(paths).toContain('/admin/agent/conversation-messages');
  });

  // GET /admin/agents
  describe('GET /admin/agents', () => {
    it('returns listAgents result', async () => {
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agents')!;
      const res = await route.handler(createMockRequest());
      expect(mockReadModel.listAgents).toHaveBeenCalledTimes(1);
      expect(res).toEqual({ status: 200, body: JSON.stringify([{ id: 'ag_001', name: 'Alpha' }]), headers: expect.objectContaining({ 'content-type': expect.any(String) }) });
    });
  });

  // GET /admin/agent
  describe('GET /admin/agent', () => {
    it('delegates to getAgent with query agentId', async () => {
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent')!;
      await route.handler(createMockRequest(new Map([['agentId', 'ag_002']])));
      expect(mockReadModel.getAgent).toHaveBeenCalledWith('ag_002');
    });

    it('returns 404 when agent not found', async () => {
      mockReadModel.getAgent.mockResolvedValue(null);
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent')!;
      const res = await route.handler(createMockRequest(new Map([['agentId', 'ag_unknown']])));
      expect(res).toEqual({ status: 404, body: JSON.stringify({ error: 'Agent not found: ag_unknown' }), headers: expect.objectContaining({ 'content-type': expect.any(String) }) });
    });

    it('throws ZodError when agentId missing', async () => {
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent')!;
      await expect(route.handler(createMockRequest(new Map([['agentId', null]])))).rejects.toBeInstanceOf(ZodError);
    });
  });

  // GET /admin/agent/recent-conversations
  describe('GET /admin/agent/recent-conversations', () => {
    it('returns conversations from readModel', async () => {
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent/recent-conversations')!;
      const res = await route.handler(createMockRequest(new Map([['agentId', 'ag_003']])));
      expect(mockReadModel.listAgentRecentConversations).toHaveBeenCalledWith('ag_003');
      expect(res).toEqual({ status: 200, body: JSON.stringify([{ id: 'conv_1' }]), headers: expect.objectContaining({ 'content-type': expect.any(String) }) });
    });

    it('returns 404 when agent not found', async () => {
      mockReadModel.listAgentRecentConversations.mockResolvedValue(null);
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent/recent-conversations')!;
      const res = await route.handler(createMockRequest(new Map([['agentId', 'ag_404']])));
      expect(res).toEqual({ status: 404, body: JSON.stringify({ error: 'Agent not found: ag_404' }), headers: expect.objectContaining({ 'content-type': expect.any(String) }) });
    });
  });

  // GET /admin/agent/execution-steps
  describe('GET /admin/agent/execution-steps', () => {
    it('passes agentId, limit, offset to readModel', async () => {
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent/execution-steps')!;
      await route.handler(createMockRequest(new Map([
        ['agentId', 'ag_004'],
        ['limit', '50'],
        ['offset', '10'],
      ])));
      expect(mockReadModel.listAgentExecutionSteps).toHaveBeenCalledWith({
        agentId: 'ag_004',
        limit: 50,
        offset: 10,
      });
    });

    it('uses schema defaults when limit/offset not provided', async () => {
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent/execution-steps')!;
      await route.handler(createMockRequest(new Map([['agentId', 'ag_005']])));
      // agentExecutionStepsQuerySchema applies defaults: limit=20, offset=0
      expect(mockReadModel.listAgentExecutionSteps).toHaveBeenCalledWith({
        agentId: 'ag_005',
        limit: 20,
        offset: 0,
      });
    });
  });

  // GET /admin/agent/thread-messages
  describe('GET /admin/agent/thread-messages', () => {
    it('passes agentId, page, perPage to readModel', async () => {
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent/thread-messages')!;
      await route.handler(createMockRequest(new Map([
        ['agentId', 'ag_006'],
        ['page', '3'],
        ['perPage', '25'],
      ])));
      expect(mockReadModel.listAgentThreadMessages).toHaveBeenCalledWith({
        agentId: 'ag_006',
        page: 3,
        perPage: 25,
      });
    });
  });

  // GET /admin/agent/ltm-thread-messages
  describe('GET /admin/agent/ltm-thread-messages', () => {
    it('passes to listAgentLongTermMemoryThreadMessages', async () => {
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent/ltm-thread-messages')!;
      await route.handler(createMockRequest(new Map([
        ['agentId', 'ag_007'],
        ['page', '1'],
        ['perPage', '10'],
      ])));
      expect(mockReadModel.listAgentLongTermMemoryThreadMessages).toHaveBeenCalledWith({
        agentId: 'ag_007',
        page: 1,
        perPage: 10,
      });
    });
  });

  // GET /admin/agent/runtime-memory
  describe('GET /admin/agent/runtime-memory', () => {
    it('returns runtime memory snapshot', async () => {
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent/runtime-memory')!;
      const res = await route.handler(createMockRequest(new Map([['agentId', 'ag_008']])));
      expect(mockReadModel.getAgentRuntimeMemory).toHaveBeenCalledWith('ag_008');
      expect(res).toEqual({ status: 200, body: JSON.stringify({ snapshot: 'memory' }), headers: expect.objectContaining({ 'content-type': expect.any(String) }) });
    });

    it('returns 404 when snapshot not found', async () => {
      mockReadModel.getAgentRuntimeMemory.mockResolvedValue(null);
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent/runtime-memory')!;
      const res = await route.handler(createMockRequest(new Map([['agentId', 'ag_009']])));
      expect(res).toEqual({ status: 404, body: JSON.stringify({ error: 'Agent not found: ag_009' }), headers: expect.objectContaining({ 'content-type': expect.any(String) }) });
    });
  });

  // GET /admin/agent/om-debug-export
  describe('GET /admin/agent/om-debug-export', () => {
    it('returns om debug export', async () => {
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent/om-debug-export')!;
      const res = await route.handler(createMockRequest(new Map([['agentId', 'ag_010']])));
      expect(mockReadModel.getAgentOmDebugExport).toHaveBeenCalledWith('ag_010');
      expect(res).toEqual({ status: 200, body: JSON.stringify({ debug: true }), headers: expect.objectContaining({ 'content-type': expect.any(String) }) });
    });

    it('returns 404 when not found', async () => {
      mockReadModel.getAgentOmDebugExport.mockResolvedValue(null);
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent/om-debug-export')!;
      const res = await route.handler(createMockRequest(new Map([['agentId', 'ag_011']])));
      expect(res).toEqual({ status: 404, body: JSON.stringify({ error: 'Agent not found: ag_011' }), headers: expect.objectContaining({ 'content-type': expect.any(String) }) });
    });
  });

  // GET /admin/agent/conversation-messages
  describe('GET /admin/agent/conversation-messages', () => {
    it('passes all query params to readModel', async () => {
      registerAgentReadRoutes(httpServer, mockReadModel);
      const route = httpServer.routes.find((r) => r.path === '/admin/agent/conversation-messages')!;
      await route.handler(createMockRequest(new Map([
        ['agentId', 'ag_012'],
        ['provider', 'discord'],
        ['targetKey', 'chan_xyz'],
        ['limit', '20'],
        ['offset', '5'],
      ])));
      expect(mockReadModel.listAgentConversationMessages).toHaveBeenCalledWith({
        agentId: 'ag_012',
        provider: 'discord',
        targetKey: 'chan_xyz',
        limit: 20,
        offset: 5,
      });
    });
  });
});
