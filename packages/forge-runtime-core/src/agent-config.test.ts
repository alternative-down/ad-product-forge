import { describe, expect, it } from 'vitest';
import type { AgentConfig } from './agent-config.js';

describe('agent-config', () => {
  describe('AgentConfig', () => {
    it('accepts minimal config', () => {
      const config: AgentConfig = {
        id: 'agent-1',
        name: 'My Agent',
        model: 'claude-sonnet-4-20250514',
      };
      expect(config.id).toBe('agent-1');
    });

    it('accepts config with all optional fields', () => {
      const config: AgentConfig = {
        id: 'agent-2',
        name: 'Full Agent',
        description: 'A fully configured agent',
        instructions: 'You are a helpful assistant',
        model: 'claude-sonnet-4-20250514',
        tools: { tool1: {}, tool2: {} },
        agents: { subagent: {} },
        output: { result: 'ok' },
        requestContext: { userId: '123' },
      };
      expect(config.tools).toHaveProperty('tool1');
      expect(config.output).toEqual({ result: 'ok' });
    });

    it('accepts config with typed agentId', () => {
      const config: AgentConfig<'custom-agent-id'> = {
        id: 'custom-agent-id',
        name: 'Typed Agent',
        model: 'claude-sonnet-4-20250514',
      };
      expect(config.id).toBe('custom-agent-id');
    });

    it('accepts config with typed tools', () => {
      type MyTools = { echo: { message: string } };
      const config: AgentConfig<string, MyTools> = {
        id: 'typed-tools-agent',
        name: 'Typed Tools Agent',
        model: 'claude-sonnet-4-20250514',
        tools: { echo: { message: 'hello' } },
      };
      expect(config.tools).toHaveProperty('echo');
    });

    it('accepts config with typed output', () => {
      const config: AgentConfig<string, Record<string, unknown>, { status: string }> = {
        id: 'output-agent',
        name: 'Output Agent',
        model: 'claude-sonnet-4-20250514',
        output: { status: 'success' },
      };
      expect(config.output?.status).toBe('success');
    });

    it('accepts config with typed requestContext', () => {
      const config: AgentConfig<string, Record<string, unknown>, unknown, { userId: string; role: string }> = {
        id: 'ctx-agent',
        name: 'Context Agent',
        model: 'claude-sonnet-4-20250514',
        requestContext: { userId: 'u1', role: 'admin' },
      };
      expect(config.requestContext?.role).toBe('admin');
    });

    it('model field accepts unknown type', () => {
      const config: AgentConfig = {
        id: 'model-agent',
        name: 'Model Agent',
        model: { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
      };
      expect(config.model).toBeDefined();
    });
  });
});
