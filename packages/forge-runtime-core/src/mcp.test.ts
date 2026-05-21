import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ForgeMcpToolset } from './mcp.js';

// vi.hoisted ensures these are available before vi.mock runs (hoisting)
const { mockMcpSessionRegistry, mockMcpGateway } = vi.hoisted(() => {
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

  return { mockMcpSessionRegistry: mockSessionRegistry, mockMcpGateway: mockGateway };
});

vi.mock('agent-runtime-core/integrations', async (original) => {
  const actual = await original();
  return {
    ...actual,
    McpSessionRegistry: mockMcpSessionRegistry,
    SdkMcpGateway: mockMcpGateway,
  };
});

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

    it('registers a session for each server', async () => {
      const ts = new ForgeMcpToolset({
        servers: [
          {
            id: 's1',
            name: 'ServerOne',
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
  });

  describe('dispose', () => {
    it('resolves without error', async () => {
      const ts = new ForgeMcpToolset({ servers: [] });
      await expect(ts.dispose()).resolves.toBeUndefined();
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
