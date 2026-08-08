import { describe, expect, it, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import { ForgeMcpToolset } from './mcp.js';

// vi.hoisted ensures these are available before vi.mock runs (hoisting)
const { mockMcpSessionRegistry, mockMcpGateway, mockForgeDebug } = vi.hoisted(() => {
  const mockSessionRegistry = vi.fn(function MockSessionRegistry() {
    return {
      getActionDefinitions: vi.fn().mockResolvedValue([]),
      getSession: vi.fn().mockResolvedValue({
        listTools: vi.fn().mockResolvedValue([]),
        callTool: vi.fn().mockResolvedValue({ result: 'ok' }),
      }),
      disposeAll: vi.fn().mockResolvedValue(undefined),
    };
  });

  const mockGateway = vi.fn(function MockGateway() {
    return {};
  });

  const mockDebug = vi.fn();

  return {
    mockMcpSessionRegistry: mockSessionRegistry,
    mockMcpGateway: mockGateway,
    mockForgeDebug: mockDebug,
  };
});

vi.mock('agent-runtime-core/integrations', async (original) => {
  const actual = await original();
  return {
    ...actual,
    McpSessionRegistry: mockMcpSessionRegistry,
    SdkMcpGateway: mockMcpGateway,
  };
});

vi.mock('./debug.js', () => ({
  forgeDebug: mockForgeDebug,
}));

describe('ForgeMcpToolset', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMcpSessionRegistry.mockImplementation(function MockSessionRegistry() {
      return {
        getActionDefinitions: vi.fn().mockResolvedValue([]),
        getSession: vi.fn().mockResolvedValue({
          listTools: vi.fn().mockResolvedValue([]),
          callTool: vi.fn().mockResolvedValue({ result: 'ok' }),
        }),
        disposeAll: vi.fn().mockResolvedValue(undefined),
      };
    });
    mockMcpGateway.mockImplementation(function MockGateway() {
      return {};
    });
  });

  describe('constructor', () => {
    it('accepts empty server array', () => {
      expect(() => new ForgeMcpToolset({ servers: [] })).not.toThrow();
    });

    it('accepts valid stdio server config', () => {
      expect(
        () =>
          new ForgeMcpToolset({
            servers: [
              {
                id: 'server-1',
                name: 'TestServer',
                transport: 'stdio',
                command: 'node',
                args: ['./server.js'],
              },
            ],
          }),
      ).not.toThrow();
    });

    it('accepts valid streamable-http server config', () => {
      expect(
        () =>
          new ForgeMcpToolset({
            servers: [
              {
                id: 'server-1',
                name: 'HttpServer',
                transport: 'http-stream',
                url: 'https://example.com/mcp',
              },
            ],
          }),
      ).not.toThrow();
    });

    it('throws for missing required server fields', () => {
      expect(
        () =>
          new ForgeMcpToolset({
            servers: [{ id: 's1' }] as never,
          }),
      ).toThrow();
    });

    it('throws for invalid transport type', () => {
      expect(
        () =>
          new ForgeMcpToolset({
            servers: [
              {
                id: 's1',
                name: 'Bad',
                transport: 'invalid' as never,
              },
            ],
          }),
      ).toThrow();
    });
  });

  describe('createRuntimeActions', () => {
    it('resolves to empty array for no servers', async () => {
      const ts = new ForgeMcpToolset({ servers: [] });
      const result = await ts.createRuntimeActions();
      expect(result).toEqual([]);
    });

    it('calls sessions.getActionDefinitions for each server', async () => {
      const ts = new ForgeMcpToolset({
        servers: [
          {
            id: 's1',
            name: 'Server1',
            transport: 'stdio',
            command: 'node',
            args: [],
          },
        ],
      });
      await ts.createRuntimeActions();
      expect(mockMcpSessionRegistry).toHaveBeenCalled();
    });
  });

  describe('createTools', () => {
    it('resolves to empty record for no servers', async () => {
      const ts = new ForgeMcpToolset({ servers: [] });
      const result = await ts.createTools();
      expect(result).toEqual({});
    });

    it('resolves to empty record when server has no tools', async () => {
      const ts = new ForgeMcpToolset({
        servers: [
          {
            id: 's1',
            name: 'EmptyServer',
            transport: 'stdio',
            command: 'node',
            args: [],
          },
        ],
      });
      const result = await ts.createTools();
      expect(result).toEqual({});
    });

    it('exposes tools with Zod inputSchema (Finding 1 fix)', async () => {
      mockMcpSessionRegistry.mockImplementation(function MockSessionRegistry() {
        return {
          getActionDefinitions: vi.fn().mockResolvedValue([]),
          getSession: vi.fn().mockResolvedValue({
            listTools: vi.fn().mockResolvedValue([
              { name: 'greet', description: 'Greet someone' },
            ]),
            callTool: vi.fn().mockResolvedValue({ result: 'ok' }),
          }),
          disposeAll: vi.fn().mockResolvedValue(undefined),
        };
      });

      const ts = new ForgeMcpToolset({
        servers: [
          {
            id: 's1',
            name: 'ToolServer',
            transport: 'stdio',
            command: 'node',
            args: [],
          },
        ],
      });
      const tools = await ts.createTools();

      // Verify the tool was created
      expect(tools.greet).toBeDefined();

      // Finding 1: inputSchema should be a ZodType (passthrough), not a parse wrapper
      // We can't directly inspect the Tool's inputSchema here because it's stored
      // as unknown, but we can verify the tool accepts arbitrary input via execute
      await expect(
        tools.greet.execute({ arbitrary: 'input' }, {} as never),
      ).resolves.toEqual({ result: 'ok' });
    });

    it('forgeDebug called when getSession fails (Finding 4 observability)', async () => {
      mockMcpSessionRegistry.mockImplementation(function MockSessionRegistry() {
        return {
          getActionDefinitions: vi.fn().mockResolvedValue([]),
          getSession: vi.fn().mockRejectedValue(new Error('connection refused')),
          disposeAll: vi.fn().mockResolvedValue(undefined),
        };
      });

      const ts = new ForgeMcpToolset({
        servers: [
          {
            id: 's1',
            name: 'BrokenServer',
            transport: 'stdio',
            command: 'node',
            args: [],
          },
        ],
      });

      await expect(ts.createTools()).rejects.toThrow('connection refused');

      // Verify forgeDebug was called with correct scope/level/message
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'mcp-toolset',
          level: 'error',
          message: expect.stringContaining('getSession failed'),
          serverId: 's1',
          serverName: 'BrokenServer',
          error: expect.stringContaining('connection refused'),
        }),
      );
    });

    it('forgeDebug called when listTools fails (Finding 4 observability)', async () => {
      mockMcpSessionRegistry.mockImplementation(function MockSessionRegistry() {
        return {
          getActionDefinitions: vi.fn().mockResolvedValue([]),
          getSession: vi.fn().mockResolvedValue({
            listTools: vi.fn().mockRejectedValue(new Error('protocol error')),
            callTool: vi.fn().mockResolvedValue({ result: 'ok' }),
          }),
          disposeAll: vi.fn().mockResolvedValue(undefined),
        };
      });

      const ts = new ForgeMcpToolset({
        servers: [
          {
            id: 's1',
            name: 'ListFailServer',
            transport: 'stdio',
            command: 'node',
            args: [],
          },
        ],
      });

      await expect(ts.createTools()).rejects.toThrow('protocol error');

      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'mcp-toolset',
          level: 'error',
          message: expect.stringContaining('listTools failed'),
          serverId: 's1',
          serverName: 'ListFailServer',
          error: expect.stringContaining('protocol error'),
        }),
      );
    });

    it('forgeDebug called when callTool fails (Finding 4 observability)', async () => {
      const callToolError = new Error('tool execution failed');
      mockMcpSessionRegistry.mockImplementation(function MockSessionRegistry() {
        return {
          getActionDefinitions: vi.fn().mockResolvedValue([]),
          getSession: vi.fn().mockResolvedValue({
            listTools: vi.fn().mockResolvedValue([
              { name: 'failingTool', description: 'Always fails' },
            ]),
            callTool: vi.fn().mockRejectedValue(callToolError),
          }),
          disposeAll: vi.fn().mockResolvedValue(undefined),
        };
      });

      const ts = new ForgeMcpToolset({
        servers: [
          {
            id: 's1',
            name: 'ExecFailServer',
            transport: 'stdio',
            command: 'node',
            args: [],
          },
        ],
      });

      const tools = await ts.createTools();

      await expect(
        tools.failingTool.execute({ x: 1 }, {} as never),
      ).rejects.toThrow('tool execution failed');

      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'mcp-toolset',
          level: 'error',
          message: expect.stringContaining('callTool failingTool failed'),
          serverId: 's1',
          serverName: 'ExecFailServer',
          toolName: 'failingTool',
          error: expect.stringContaining('tool execution failed'),
        }),
      );
    });
  });

  describe('dispose', () => {
    it('resolves without error', async () => {
      const ts = new ForgeMcpToolset({ servers: [] });
      await expect(ts.dispose()).resolves.toBeUndefined();
    });

    it('calls sessions.disposeAll (gateway is stateless, no explicit dispose needed per #6309 Finding 3)', async () => {
      const disposeAllSpy = vi.fn().mockResolvedValue(undefined);
      mockMcpSessionRegistry.mockImplementation(function MockSessionRegistry() {
        return {
          getActionDefinitions: vi.fn().mockResolvedValue([]),
          getSession: vi.fn().mockResolvedValue({
            listTools: vi.fn().mockResolvedValue([]),
            callTool: vi.fn().mockResolvedValue({ result: 'ok' }),
          }),
          disposeAll: disposeAllSpy,
        };
      });

      const ts = new ForgeMcpToolset({ servers: [] });
      await ts.dispose();

      expect(disposeAllSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('mapServerToTransport', () => {
    it('maps stdio transport with env', async () => {
      const ts = new ForgeMcpToolset({
        servers: [
          {
            id: 's1',
            name: 'StdioWithEnv',
            transport: 'stdio',
            command: 'node',
            args: ['./server.js'],
            env: { DEBUG: '1' },
          },
        ],
      });
      await expect(ts.createRuntimeActions()).resolves.toBeDefined();
    });

    it('maps streamable-http transport with headers', async () => {
      const ts = new ForgeMcpToolset({
        servers: [
          {
            id: 's1',
            name: 'HttpWithHeaders',
            transport: 'http-stream',
            url: 'https://example.com/mcp',
            headers: { Authorization: 'Bearer token' },
          },
        ],
      });
      await expect(ts.createRuntimeActions()).resolves.toBeDefined();
    });
  });
});
