import { describe, expect, test } from 'vitest';

import {
  AgentLoaderDataAgentNotFoundError,
  AgentLoaderDataMissingRoleIdError,
} from './agent-loader-data.errors';

describe('agents/agent-loader-data errors', () => {
  describe('AgentLoaderDataAgentNotFoundError', () => {
    test('preserves verbatim message with agent id', () => {
      const err = new AgentLoaderDataAgentNotFoundError('agent-123');
      expect(err).toBeInstanceOf(AgentLoaderDataAgentNotFoundError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('AgentLoaderDataAgentNotFoundError');
      expect(err.code).toBe('AGENT_LOADER_DATA_AGENT_NOT_FOUND');
      expect(err.agentId).toBe('agent-123');
      expect(err.message).toBe('Agent not found in registry: agent-123');
    });
  });

  describe('AgentLoaderDataMissingRoleIdError', () => {
    test('preserves verbatim message with agent id', () => {
      const err = new AgentLoaderDataMissingRoleIdError('agent-123');
      expect(err).toBeInstanceOf(AgentLoaderDataMissingRoleIdError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('AgentLoaderDataMissingRoleIdError');
      expect(err.code).toBe('AGENT_LOADER_DATA_MISSING_ROLE_ID');
      expect(err.agentId).toBe('agent-123');
      expect(err.message).toBe('Agent is missing roleId: agent-123');
    });
  });
});
