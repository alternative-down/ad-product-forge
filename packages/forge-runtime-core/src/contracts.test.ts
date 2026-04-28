import { describe, expect, it } from 'vitest';
import {
  forgeAgentRuntimeConfigSchema,
  forgeMcpHttpServerSchema,
  forgeMcpServerSchema,
  forgeMcpStdioServerSchema,
} from './contracts.js';
import type { ForgeAgentRuntimeConfig, ForgeMcpServerConfig } from './contracts.js';

describe('contracts', () => {
  describe('forgeMcpStdioServerSchema', () => {
    it('validates minimal stdio config', () => {
      const result = forgeMcpStdioServerSchema.safeParse({
        id: 's1',
        name: 'My Server',
        transport: 'stdio',
        command: 'node',
      });
      expect(result.success).toBe(true);
    });

    it('accepts args and env', () => {
      const result = forgeMcpStdioServerSchema.safeParse({
        id: 's2',
        name: 'Server 2',
        transport: 'stdio',
        command: 'python',
        args: ['-m', 'server'],
        env: { DEBUG: '1' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty id', () => {
      const result = forgeMcpStdioServerSchema.safeParse({
        id: '',
        name: 'Server',
        transport: 'stdio',
        command: 'node',
      });
      expect(result.success).toBe(false);
    });

    it('rejects wrong transport type', () => {
      const result = forgeMcpStdioServerSchema.safeParse({
        id: 's1',
        name: 'Server',
        transport: 'http-stream',
        command: 'node',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('forgeMcpHttpServerSchema', () => {
    it('validates minimal http config', () => {
      const result = forgeMcpHttpServerSchema.safeParse({
        id: 'h1',
        name: 'HTTP Server',
        transport: 'http-stream',
        url: 'https://api.example.com',
      });
      expect(result.success).toBe(true);
    });

    it('accepts custom headers', () => {
      const result = forgeMcpHttpServerSchema.safeParse({
        id: 'h2',
        name: 'Server with headers',
        transport: 'http-stream',
        url: 'https://secure.example.com',
        headers: { Authorization: 'Bearer token' },
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid url', () => {
      const result = forgeMcpHttpServerSchema.safeParse({
        id: 'h3',
        name: 'Bad URL',
        transport: 'http-stream',
        url: 'not-a-url',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('forgeMcpServerSchema', () => {
    it('accepts stdio server', () => {
      const result = forgeMcpServerSchema.safeParse({
        id: 's1',
        name: 'Stdio',
        transport: 'stdio',
        command: 'node',
      });
      expect(result.success).toBe(true);
    });

    it('accepts http server', () => {
      const result = forgeMcpServerSchema.safeParse({
        id: 'h1',
        name: 'HTTP',
        transport: 'http-stream',
        url: 'https://example.com',
      });
      expect(result.success).toBe(true);
    });

    it('rejects mixed transport', () => {
      const result = forgeMcpServerSchema.safeParse({
        id: 'bad',
        name: 'Mixed',
        transport: 'stdio',
        url: 'https://example.com',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('forgeAgentRuntimeConfigSchema', () => {
    it('validates minimal config', () => {
      const result = forgeAgentRuntimeConfigSchema.safeParse({
        agentId: 'agent-1',
        threadId: 'thread-1',
      });
      expect(result.success).toBe(true);
    });

    it('validates full config', () => {
      const result = forgeAgentRuntimeConfigSchema.safeParse({
        agentId: 'agent-2',
        threadId: 'thread-2',
        runtimeId: 'runtime-2',
        assistantAuthorId: 'author-1',
        consolidateConversationOverflow: false,
      });
      expect(result.success).toBe(true);
    });

    it('uses default for consolidateConversationOverflow', () => {
      const result = forgeAgentRuntimeConfigSchema.safeParse({
        agentId: 'a1',
        threadId: 't1',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.consolidateConversationOverflow).toBe(true);
      }
    });

    it('rejects empty agentId', () => {
      const result = forgeAgentRuntimeConfigSchema.safeParse({
        agentId: '',
        threadId: 't1',
      });
      expect(result.success).toBe(false);
    });

    it('rejects empty threadId', () => {
      const result = forgeAgentRuntimeConfigSchema.safeParse({
        agentId: 'a1',
        threadId: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('type exports', () => {
    it('ForgeMcpServerConfig is assignable from valid config', () => {
      const config: ForgeMcpServerConfig = {
        id: 's1',
        name: 'Test',
        transport: 'stdio',
        command: 'echo',
      };
      expect(config.id).toBe('s1');
    });

    it('ForgeAgentRuntimeConfig is assignable from valid config', () => {
      const config: ForgeAgentRuntimeConfig = {
        agentId: 'a1',
        threadId: 't1',
      };
      expect(config.agentId).toBe('a1');
    });
  });
});
