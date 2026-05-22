import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

const mockReloadAgentMcp = vi.hoisted(() => vi.fn());
const mockCreateId = vi.hoisted(() => vi.fn());

vi.mock('../../../../utils/id', () => ({
  createId: mockCreateId,
}));

vi.mock('../../../routes/mcp-helpers', () => ({
  reloadAgentMcp: mockReloadAgentMcp,
}));

import { registerMcpOps } from './mcp-ops';

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

describe('registerMcpOps', () => {
  let httpServer: MockHttpServer;
  let mockDb: any;
  let mockLoaderConfig: any;

  beforeEach(() => {
    vi.clearAllMocks();
    mockReloadAgentMcp.mockReset();
    mockReloadAgentMcp.mockResolvedValue(undefined);
    mockCreateId.mockReset();
    mockCreateId.mockReturnValueOnce('server-id-123').mockReturnValueOnce('config-id-456');
    httpServer = { registerRoute: vi.fn() };
    mockLoaderConfig = {};
    mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockResolvedValue(undefined),
      }),
      schema: {
        mcpServerConfigs: {},
        agentMcpConfigs: {},
      },
    };
  });

  describe('POST /admin/agent/mcp/create', () => {
    it('registers the route', () => {
      registerMcpOps(httpServer as any, mockDb, mockLoaderConfig);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/admin/agent/mcp/create',
        }),
      );
    });

    it('creates mcp server and agent config, reloads agent mcp, returns 201', async () => {
      registerMcpOps(httpServer as any, mockDb, mockLoaderConfig);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/create');

      const response = await handler(
        makeRequest({
          agentId: 'agent-mcp-1',
          name: 'Test MCP Server',
          description: 'A test MCP server',
          transport: 'stdio',
          command: 'npx',
          argsText: '["--flag"]',
          envVarsText: '{}',
          isActive: true,
        }),
      );

      expect(response.status).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('agent-mcp-1');
      expect(body.configId).toBe('config-id-456');
      expect(body.serverId).toBe('server-id-123');
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
      expect(mockReloadAgentMcp).toHaveBeenCalledWith(mockDb, mockLoaderConfig, 'agent-mcp-1');
    });

    it('handles http_streamable transport with url and headers', async () => {
      registerMcpOps(httpServer as any, mockDb, mockLoaderConfig);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/create');

      const response = await handler(
        makeRequest({
          agentId: 'agent-http',
          name: 'HTTP MCP',
          transport: 'http_streamable',
          url: 'https://mcp.example.com/stream',
          headersText: '{"Authorization": "Bearer token"}',
          isActive: false,
        }),
      );

      expect(response.status).toBe(201);
      expect(mockDb.insert).toHaveBeenCalledTimes(2);
    });

    it('returns 500 on database insert error', async () => {
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('DB insert failed')),
      });
      registerMcpOps(httpServer as any, mockDb, mockLoaderConfig);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/create');

      const response = await handler(
        makeRequest({
          agentId: 'agent-fail',
          name: 'Fail MCP',
          transport: 'stdio',
          command: 'fail',
          isActive: true,
        }),
      );

      expect(response.status).toBe(500);
    });

    it('returns 500 on reloadAgentMcp error', async () => {
      mockReloadAgentMcp.mockRejectedValue(new Error('Reload MCP failed'));
      registerMcpOps(httpServer as any, mockDb, mockLoaderConfig);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/create');

      const response = await handler(
        makeRequest({
          agentId: 'agent-reload-fail',
          name: 'Reload Fail',
          transport: 'stdio',
          command: 'fail',
          isActive: true,
        }),
      );

      expect(response.status).toBe(500);
    });
  });
});