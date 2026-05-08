/**
 * Unit tests for admin/routes/schemas/mcp.ts.
 * Zod validation schemas for MCP server management routes.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import {
  createAgentMcpServerSchema,
  upsertSystemMcpServerSchema,
  deleteSystemMcpServerSchema,
} from './mcp';

// ─── createAgentMcpServerSchema — stdio transport ───────────────────────────

describe('createAgentMcpServerSchema — stdio transport', () => {
  it('parses minimal valid stdio input', () => {
    const result = createAgentMcpServerSchema.parse({
      agentId: 'agent-1',
      name: 'my-mcp-server',
      transport: 'stdio',
      command: 'npx',
    });
    expect(result.agentId).toBe('agent-1');
    expect(result.name).toBe('my-mcp-server');
    expect(result.transport).toBe('stdio');
    expect(result.command).toBe('npx');
  });

  it('parses with all optional fields', () => {
    const result = createAgentMcpServerSchema.parse({
      agentId: 'a', name: 'server', description: 'A test server', isActive: true,
      transport: 'stdio', command: 'node', argsText: '--arg1 value1',
      envVarsText: 'API_KEY=secret', url: '', headersText: 'X-Custom: value',
    });
    expect(result.description).toBe('A test server');
    expect(result.argsText).toBe('--arg1 value1');
    expect(result.envVarsText).toBe('API_KEY=secret');
  });

  it('rejects missing agentId', () => {
    expect(() => createAgentMcpServerSchema.parse({ name: 's', transport: 'stdio', command: 'c' })).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() => createAgentMcpServerSchema.parse({ agentId: '', name: 's', transport: 'stdio', command: 'c' })).toThrow();
  });

  it('rejects missing name', () => {
    expect(() => createAgentMcpServerSchema.parse({ agentId: 'a', transport: 'stdio', command: 'c' })).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => createAgentMcpServerSchema.parse({ agentId: 'a', name: '   ', transport: 'stdio', command: 'c' })).toThrow();
  });

  it('rejects stdio transport without command', () => {
    expect(() => createAgentMcpServerSchema.parse({ agentId: 'a', name: 's', transport: 'stdio' })).toThrow();
  });

  it('defaults isActive to true', () => {
    const result = createAgentMcpServerSchema.parse({ agentId: 'a', name: 's', transport: 'stdio', command: 'c' });
    expect(result.isActive).toBe(true);
  });

  it('defaults description to empty string', () => {
    const result = createAgentMcpServerSchema.parse({ agentId: 'a', name: 's', transport: 'stdio', command: 'c' });
    expect(result.description).toBe('');
  });
});

// ─── createAgentMcpServerSchema — http_streamable transport ──────────────────

describe('createAgentMcpServerSchema — http_streamable transport', () => {
  it('parses minimal valid http_streamable input', () => {
    const result = createAgentMcpServerSchema.parse({
      agentId: 'agent-1', name: 'http-server', transport: 'http_streamable', url: 'https://mcp.example.com/sse',
    });
    expect(result.transport).toBe('http_streamable');
    expect(result.url).toBe('https://mcp.example.com/sse');
  });

  it('parses with optional headersText', () => {
    const result = createAgentMcpServerSchema.parse({
      agentId: 'a', name: 's', transport: 'http_streamable', url: 'https://example.com', headersText: 'Authorization: Bearer token',
    });
    expect(result.headersText).toBe('Authorization: Bearer token');
  });

  it('rejects http_streamable without url', () => {
    expect(() => createAgentMcpServerSchema.parse({ agentId: 'a', name: 's', transport: 'http_streamable' })).toThrow();
  });

  it('rejects invalid url format', () => {
    expect(() => createAgentMcpServerSchema.parse({ agentId: 'a', name: 's', transport: 'http_streamable', url: 'not-a-url' })).toThrow();
  });

  it('rejects http_streamable with empty url', () => {
    expect(() => createAgentMcpServerSchema.parse({ agentId: 'a', name: 's', transport: 'http_streamable', url: '' })).toThrow();
  });
});

// ─── createAgentMcpServerSchema — invalid transport ─────────────────────────

describe('createAgentMcpServerSchema — invalid transport', () => {
  it('rejects unknown transport value', () => {
    expect(() => createAgentMcpServerSchema.parse({ agentId: 'a', name: 's', transport: 'websocket', command: 'c' })).toThrow();
  });

  it('rejects missing transport', () => {
    expect(() => createAgentMcpServerSchema.parse({ agentId: 'a', name: 's', command: 'c' })).toThrow();
  });
});

// ─── upsertSystemMcpServerSchema — stdio transport ─────────────────────────

describe('upsertSystemMcpServerSchema — stdio transport', () => {
  it('parses minimal valid stdio input', () => {
    const result = upsertSystemMcpServerSchema.parse({ name: 'system-mcp-server', transport: 'stdio', command: '/usr/local/bin/mcp' });
    expect(result.name).toBe('system-mcp-server');
    expect(result.command).toBe('/usr/local/bin/mcp');
  });

  it('parses with serverId (for update)', () => {
    const result = upsertSystemMcpServerSchema.parse({ serverId: 'server-123', name: 's', transport: 'stdio', command: 'c' });
    expect(result.serverId).toBe('server-123');
  });

  it('defaults isActive to true', () => {
    const result = upsertSystemMcpServerSchema.parse({ name: 's', transport: 'stdio', command: 'c' });
    expect(result.isActive).toBe(true);
  });

  it('rejects stdio without command', () => {
    expect(() => upsertSystemMcpServerSchema.parse({ name: 's', transport: 'stdio' })).toThrow();
  });

  it('rejects empty name', () => {
    expect(() => upsertSystemMcpServerSchema.parse({ name: '', transport: 'stdio', command: 'c' })).toThrow();
  });
});

// ─── upsertSystemMcpServerSchema — http_streamable transport ─────────────────

describe('upsertSystemMcpServerSchema — http_streamable transport', () => {
  it('parses valid http_streamable', () => {
    const result = upsertSystemMcpServerSchema.parse({ name: 's', transport: 'http_streamable', url: 'https://mcp.io/sse' });
    expect(result.url).toBe('https://mcp.io/sse');
  });

  it('rejects http_streamable without url', () => {
    expect(() => upsertSystemMcpServerSchema.parse({ name: 's', transport: 'http_streamable' })).toThrow();
  });

  it('rejects invalid url format', () => {
    expect(() => upsertSystemMcpServerSchema.parse({ name: 's', transport: 'http_streamable', url: 'not-a-url' })).toThrow();
  });
});

// ─── deleteSystemMcpServerSchema ───────────────────────────────────────────

describe('deleteSystemMcpServerSchema', () => {
  it('parses valid input', () => {
    expect(deleteSystemMcpServerSchema.parse({ serverId: 'server-abc' })).toMatchObject({ serverId: 'server-abc' });
  });

  it('rejects missing serverId', () => {
    expect(() => deleteSystemMcpServerSchema.parse({})).toThrow();
  });

  it('rejects empty serverId', () => {
    expect(() => deleteSystemMcpServerSchema.parse({ serverId: '' })).toThrow();
  });
});

// ─── safeParse (non-throwing) ─────────────────────────────────────────────

describe('schema.safeParse', () => {
  it('createAgentMcpServerSchema safeParse returns success false for missing agentId', () => {
    const result = createAgentMcpServerSchema.safeParse({ name: 's', transport: 'stdio', command: 'c' });
    expect(result.success).toBe(false);
  });

  it('createAgentMcpServerSchema safeParse returns success true for valid stdio input', () => {
    const result = createAgentMcpServerSchema.safeParse({ agentId: 'a', name: 's', transport: 'stdio', command: 'c' });
    expect(result.success).toBe(true);
  });

  it('upsertSystemMcpServerSchema safeParse returns success true for valid input', () => {
    const result = upsertSystemMcpServerSchema.safeParse({ name: 's', transport: 'stdio', command: 'c' });
    expect(result.success).toBe(true);
  });

  it('deleteSystemMcpServerSchema safeParse returns success false for empty serverId', () => {
    const result = deleteSystemMcpServerSchema.safeParse({ serverId: '' });
    expect(result.success).toBe(false);
  });
});