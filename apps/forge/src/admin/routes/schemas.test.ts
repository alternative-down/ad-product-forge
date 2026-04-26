import { describe, it, expect } from 'vitest';
import {
  agentIdQuerySchema,
  agentExecutionStepsQuerySchema,
  hireAgentSchema,
  upsertSystemIntegrationSchema,
  createPayableSchema,
  createAgentMcpServerSchema,
} from './schemas.js';

describe('Admin Route Schemas', () => {
  describe('agentIdQuerySchema', () => {
    it('validates valid agentId', () => {
      const result = agentIdQuerySchema.parse({ agentId: 'test-agent' });
      expect(result.agentId).toBe('test-agent');
    });

    it('rejects empty agentId', () => {
      expect(() => agentIdQuerySchema.parse({ agentId: '' })).toThrow();
    });
  });

  describe('agentExecutionStepsQuerySchema', () => {
    it('applies defaults', () => {
      const result = agentExecutionStepsQuerySchema.parse({
        agentId: 'test-agent',
      });
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('respects provided values', () => {
      const result = agentExecutionStepsQuerySchema.parse({
        agentId: 'test-agent',
        limit: '50',
        offset: '10',
      });
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(10);
    });
  });

  describe('hireAgentSchema', () => {
    it('validates complete input', () => {
      const result = hireAgentSchema.parse({
        name: 'Test Agent',
        role: 'developer',
        weeklyBudget: 1000,
        budgetCap: 5000,
      });
      expect(result.name).toBe('Test Agent');
    });

    it('accepts optional fields', () => {
      const result = hireAgentSchema.parse({
        name: 'Test Agent',
        role: 'developer',
        weeklyBudget: 1000,
        budgetCap: 5000,
        systemPrompt: 'Be helpful',
        modelId: 'claude-3-5-sonnet',
      });
      expect(result.systemPrompt).toBe('Be helpful');
    });
  });

  describe('upsertSystemIntegrationSchema', () => {
    it('validates migadu integration', () => {
      const result = upsertSystemIntegrationSchema.parse({
        providerType: 'migadu',
        isEnabled: true,
        config: {
          apiUser: 'test@example.com',
          apiKey: 'secret-key',
        },
      });
      expect(result.providerType).toBe('migadu');
    });

    it('validates coolify integration', () => {
      const result = upsertSystemIntegrationSchema.parse({
        providerType: 'coolify',
        isEnabled: true,
        config: {
          baseUrl: 'https://coolify.example.com',
          adminToken: 'token',
          serverId: 'srv-123',
          destinationId: 'dest-456',
        },
      });
      expect(result.providerType).toBe('coolify');
    });
  });

  describe('createPayableSchema', () => {
    it('validates agent_contract payable', () => {
      const result = createPayableSchema.parse({
        kind: 'agent_contract',
        agentId: 'agent-123',
        amount: 500,
      });
      expect(result.kind).toBe('agent_contract');
    });

    it('validates system_expense payable', () => {
      const result = createPayableSchema.parse({
        kind: 'system_expense',
        description: 'Server costs',
        amount: 100,
        category: 'infrastructure',
      });
      expect(result.kind).toBe('system_expense');
    });
  });

  describe('createAgentMcpServerSchema', () => {
    it('validates stdio transport', () => {
      const result = createAgentMcpServerSchema.parse({
        agentId: 'agent-123',
        name: 'test-mcp',
        transport: 'stdio',
        command: 'npx',
        argsText: '-v',
      });
      expect(result.transport).toBe('stdio');
    });

    it('validates http_streamable transport', () => {
      const result = createAgentMcpServerSchema.parse({
        agentId: 'agent-123',
        name: 'test-mcp',
        transport: 'http_streamable',
        url: 'https://mcp.example.com',
      });
      expect(result.transport).toBe('http_streamable');
    });
  });
});