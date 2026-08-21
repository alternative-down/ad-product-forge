import { describe, expect, it } from 'vitest';
import { TerminateAgentNotFoundError } from './terminate-agent.errors';

describe('TerminateAgentNotFoundError', () => {
  it('preserves verbatim message', () => {
    const err = new TerminateAgentNotFoundError('agent-123');
    expect(err).toBeInstanceOf(TerminateAgentNotFoundError);
    expect(err.name).toBe('TerminateAgentNotFoundError');
    expect(err.code).toBe('TERMINATE_AGENT_NOT_FOUND');
    expect(err.agentId).toBe('agent-123');
    expect(err.message).toBe('Agent not found: agent-123');
  });
});
