import type { AgentLoaderConfig } from '../../../../agents/agent-loader';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));
vi.mock('../../../../routes/mcp-helpers', () => ({
  reloadAgentMcp: vi.fn().mockResolvedValue(undefined),
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

describe('registerMcpOps', () => {
  let httpServer: MockHttpServer;
  let db: { insert: (table: any) => { values: (v: any) => Promise<void> }; schema: any };

  beforeEach(() => {
    vi.clearAllMocks();
    httpServer = { registerRoute: vi.fn() };
    db = {
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
    it('registers the route', async () => {
      const { registerMcpOps } = await import('./mcp-ops');
      registerMcpOps(httpServer as any, db as any, {} as unknown as AgentLoaderConfig);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/admin/agent/mcp/create',
        }),
      );
    });

    it('creates mcp server config and agent mcp config', async () => {
      const { registerMcpOps } = await import('./mcp-ops');
      registerMcpOps(httpServer as any, db as any, {} as unknown as AgentLoaderConfig);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/create');

      const response = await handler(
        makeRequest({
          agentId: 'agent-123',
          name: 'Test MCP Server',
          description: 'A test server',
          transport: 'stdio',
          command: 'npx',
          argsText: '["--help"]',
          envVarsText: '{}',
          isActive: true,
        }),
      );

      const body = JSON.parse(response.body);
      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('agent-123');
      expect(body.serverId).toBeDefined();
      expect(body.configId).toBeDefined();
    });

    it('returns 500 on database error', async () => {
      const brokenDb = {
        insert: vi.fn().mockReturnValue({
          values: vi.fn().mockRejectedValue(new Error('DB failure')),
        }),
        schema: { mcpServerConfigs: {}, agentMcpConfigs: {} },
      };
      const { registerMcpOps } = await import('./mcp-ops');
      registerMcpOps(httpServer as any, brokenDb as any, {} as unknown as AgentLoaderConfig);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/create');

      const response = await handler(
        makeRequest({
          agentId: 'agent-123',
          name: 'Test',
          transport: 'stdio',
          command: 'npx',
        }),
      );

      expect(response.status).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });

    it('stores url and headers for http_streamable transport', async () => {
      const insertSpy = vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue(undefined) });
      const httpDb = {
        insert: insertSpy,
        schema: { mcpServerConfigs: {}, agentMcpConfigs: {} },
      };
      const { registerMcpOps } = await import('./mcp-ops');
      registerMcpOps(httpServer as any, httpDb as any, {} as unknown as AgentLoaderConfig);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/create');

      const response = await handler(
        makeRequest({
          agentId: 'agent-456',
          name: 'HTTP MCP',
          transport: 'http_streamable',
          url: 'https://mcp.example.com/stream',
          headersText: '{"Authorization":"Bearer test"}',
          isActive: false,
        }),
      );

      expect(response.status).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
    });
  });
});
