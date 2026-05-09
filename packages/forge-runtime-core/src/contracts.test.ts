import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  forgeMcpStdioServerSchema,
  forgeMcpHttpServerSchema,
  forgeMcpServerSchema,
  forgeAgentRuntimeConfigSchema,
} from './contracts';

describe('forgeMcpStdioServerSchema', () => {
  it('parses valid stdio server config', () => {
    const result = forgeMcpStdioServerSchema.parse({
      id: 'server-1',
      name: 'my-server',
      transport: 'stdio',
      command: 'npx',
      args: ['--flag'],
      env: { DEBUG: '1' },
    });
    expect(result).toEqual({
      id: 'server-1',
      name: 'my-server',
      transport: 'stdio',
      command: 'npx',
      args: ['--flag'],
      env: { DEBUG: '1' },
    });
  });

  it('applies default args and env', () => {
    const result = forgeMcpStdioServerSchema.parse({
      id: 's1',
      name: 'name',
      transport: 'stdio',
      command: 'cmd',
    });
    expect(result.args).toEqual([]);
    expect(result.env).toEqual({});
  });

  it('rejects missing required fields', () => {
    expect(() => forgeMcpStdioServerSchema.parse({ name: 'x' })).toThrow(z.ZodError);
    expect(() => forgeMcpStdioServerSchema.parse({ id: 'x' })).toThrow(z.ZodError);
    expect(() => forgeMcpStdioServerSchema.parse({ id: '', name: 'x', transport: 'stdio', command: 'c' })).toThrow();
  });

  it('rejects non-stdio transport', () => {
    expect(() =>
      forgeMcpStdioServerSchema.parse({
        id: 's1',
        name: 'x',
        transport: 'http-stream',
        command: 'c',
      }),
    ).toThrow(z.ZodError);
  });
});

describe('forgeMcpHttpServerSchema', () => {
  it('parses valid HTTP server config', () => {
    const result = forgeMcpHttpServerSchema.parse({
      id: 'http-1',
      name: 'http-server',
      transport: 'http-stream',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
    });
    expect(result.url).toBe('https://example.com/mcp');
  });

  it('rejects invalid URL', () => {
    expect(() =>
      forgeMcpHttpServerSchema.parse({
        id: 's1',
        name: 'x',
        transport: 'http-stream',
        url: 'not-a-url',
      }),
    ).toThrow(z.ZodError);
  });
});

describe('forgeMcpServerSchema', () => {
  it('accepts stdio server', () => {
    const result = forgeMcpServerSchema.parse({
      id: 's1',
      name: 'x',
      transport: 'stdio',
      command: 'c',
    });
    expect(result.transport).toBe('stdio');
  });

  it('accepts http server', () => {
    const result = forgeMcpServerSchema.parse({
      id: 's1',
      name: 'x',
      transport: 'http-stream',
      url: 'https://x.com',
    });
    expect(result.transport).toBe('http-stream');
  });

  it('rejects mixed transport fields', () => {
    expect(() =>
      forgeMcpServerSchema.parse({
        id: 's1',
        name: 'x',
        transport: 'stdio',
        url: 'https://x.com',
      }),
    ).toThrow(z.ZodError);
  });
});

describe('forgeAgentRuntimeConfigSchema', () => {
  it('parses minimal valid config', () => {
    const result = forgeAgentRuntimeConfigSchema.parse({
      agentId: 'agent-1',
      threadId: 'thread-1',
    });
    expect(result.agentId).toBe('agent-1');
    expect(result.threadId).toBe('thread-1');
    expect(result.runtimeId).toBeUndefined();
    expect(result.consolidateConversationOverflow).toBe(true);
  });

  it('parses with all optional fields', () => {
    const result = forgeAgentRuntimeConfigSchema.parse({
      agentId: 'a1',
      runtimeId: 'r1',
      threadId: 't1',
      assistantAuthorId: 'author-1',
      consolidateConversationOverflow: false,
    });
    expect(result.runtimeId).toBe('r1');
    expect(result.consolidateConversationOverflow).toBe(false);
  });

  it('rejects empty agentId', () => {
    expect(() =>
      forgeAgentRuntimeConfigSchema.parse({
        agentId: '',
        threadId: 't1',
      }),
    ).toThrow(z.ZodError);
  });

  it('rejects empty threadId', () => {
    expect(() =>
      forgeAgentRuntimeConfigSchema.parse({
        agentId: 'a1',
        threadId: '',
      }),
    ).toThrow(z.ZodError);
  });
});