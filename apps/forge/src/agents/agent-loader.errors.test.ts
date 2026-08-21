import { describe, expect, it } from 'vitest';
import { AgentLoaderMissingCapabilityError } from './agent-loader.errors';

describe('AgentLoaderMissingCapabilityError', () => {
  it('preserves verbatim message', () => {
    const err = new AgentLoaderMissingCapabilityError('agent-123');
    expect(err).toBeInstanceOf(AgentLoaderMissingCapabilityError);
    expect(err.name).toBe('AgentLoaderMissingCapabilityError');
    expect(err.code).toBe('AGENT_LOADER_MISSING_CAPABILITY');
    expect(err.agentId).toBe('agent-123');
    expect(err.message).toBe('Agent loader: capability check failed for agent-123');
  });
});
