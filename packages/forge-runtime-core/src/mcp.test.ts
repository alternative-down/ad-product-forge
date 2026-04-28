import { describe, expect, it } from 'vitest';
import { ForgeMcpToolset } from './mcp.js';
import type { ForgeMcpToolsetOptions } from './mcp.js';

describe('mcp', () => {
  describe('ForgeMcpToolsetOptions', () => {
    it('accepts minimal options', () => {
      const opts: ForgeMcpToolsetOptions = {
        servers: [{
          id: 's1',
          name: 'Server One',
          transport: 'stdio',
          command: 'node',
        }],
      };
      expect(opts.servers).toHaveLength(1);
    });

    it('accepts options with runtimeActionOptions', () => {
      const opts: ForgeMcpToolsetOptions = {
        servers: [{
          id: 's2',
          name: 'Server Two',
          transport: 'stdio',
          command: 'python',
        }],
        runtimeActionOptions: {
          timeoutMs: 30000,
        },
      };
      expect(opts.runtimeActionOptions).toHaveProperty('timeoutMs');
    });

    it('accepts http transport in options', () => {
      const opts: ForgeMcpToolsetOptions = {
        servers: [{
          id: 'h1',
          name: 'HTTP Server',
          transport: 'http-stream',
          url: 'https://api.example.com/mcp',
        }],
      };
      expect(opts.servers[0].transport).toBe('http-stream');
    });
  });

  describe('ForgeMcpToolset', () => {
    it('instantiates with stdio server config', () => {
      const toolset = new ForgeMcpToolset({
        servers: [{
          id: 'test-stdio',
          name: 'Test Stdio Server',
          transport: 'stdio',
          command: 'echo',
        }],
      });
      expect(toolset).toBeDefined();
      expect(typeof toolset.createTools).toBe('function');
      expect(typeof toolset.createRuntimeActions).toBe('function');
      expect(typeof toolset.dispose).toBe('function');
    });

    it('instantiates with http server config', () => {
      const toolset = new ForgeMcpToolset({
        servers: [{
          id: 'test-http',
          name: 'Test HTTP Server',
          transport: 'http-stream',
          url: 'https://example.com/mcp',
        }],
      });
      expect(toolset).toBeDefined();
    });

    it('instantiates with empty servers array', () => {
      const toolset = new ForgeMcpToolset({ servers: [] });
      expect(toolset).toBeDefined();
    });

    it('instantiates with multiple servers', () => {
      const toolset = new ForgeMcpToolset({
        servers: [
          { id: 's1', name: 'Server 1', transport: 'stdio', command: 'node' },
          { id: 's2', name: 'Server 2', transport: 'stdio', command: 'python' },
        ],
      });
      expect(toolset).toBeDefined();
    });

    it('createRuntimeActions returns a promise', () => {
      const toolset = new ForgeMcpToolset({ servers: [] });
      const result = toolset.createRuntimeActions();
      expect(result).toBeInstanceOf(Promise);
    });

    it('createTools returns a promise', () => {
      const toolset = new ForgeMcpToolset({ servers: [] });
      const result = toolset.createTools();
      expect(result).toBeInstanceOf(Promise);
    });

    it('dispose returns a promise', async () => {
      const toolset = new ForgeMcpToolset({ servers: [] });
      const result = toolset.dispose();
      expect(result).toBeInstanceOf(Promise);
      await result;
    });

    it('accepts custom runtime action options', () => {
      const toolset = new ForgeMcpToolset({
        servers: [{
          id: 's1',
          name: 'Server',
          transport: 'stdio',
          command: 'node',
        }],
        runtimeActionOptions: {
          timeoutMs: 60000,
          retryAttempts: 3,
        },
      });
      expect(toolset).toBeDefined();
    });

    it('creates instance with server containing args and env', () => {
      const toolset = new ForgeMcpToolset({
        servers: [{
          id: 's1',
          name: 'Server with args',
          transport: 'stdio',
          command: 'node',
          args: ['--flag', 'value'],
          env: { DEBUG: '1' },
        }],
      });
      expect(toolset).toBeDefined();
    });

    it('creates instance with server containing custom headers', () => {
      const toolset = new ForgeMcpToolset({
        servers: [{
          id: 'h1',
          name: 'Secured HTTP',
          transport: 'http-stream',
          url: 'https://secure.example.com/mcp',
          headers: { Authorization: 'Bearer token' },
        }],
      });
      expect(toolset).toBeDefined();
    });
  });
});
