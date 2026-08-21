import { describe, expect, it } from 'vitest';
import { InternalAgentRegistryNotFoundError } from './internal-agent-registry.errors';

describe('InternalAgentRegistryNotFoundError', () => {
  it('preserves verbatim message', () => {
    const err = new InternalAgentRegistryNotFoundError('agent-123');
    expect(err).toBeInstanceOf(InternalAgentRegistryNotFoundError);
    expect(err.name).toBe('InternalAgentRegistryNotFoundError');
    expect(err.code).toBe('INTERNAL_AGENT_REGISTRY_NOT_FOUND');
    expect(err.agentId).toBe('agent-123');
    expect(err.message).toBe('Internal agent not found: agent-123');
  });
});
