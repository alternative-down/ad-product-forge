import { describe, expect, it } from 'vitest';
import { InternalAgentLifecycleInvalidStateError } from './internal-agent-lifecycle.errors';

describe('InternalAgentLifecycleInvalidStateError', () => {
  it('preserves verbatim message', () => {
    const err = new InternalAgentLifecycleInvalidStateError('agent-123', 'terminated');
    expect(err).toBeInstanceOf(InternalAgentLifecycleInvalidStateError);
    expect(err.name).toBe('InternalAgentLifecycleInvalidStateError');
    expect(err.code).toBe('INTERNAL_AGENT_LIFECYCLE_INVALID_STATE');
    expect(err.agentId).toBe('agent-123');
    expect(err.currentState).toBe('terminated');
    expect(err.message).toBe('Invalid lifecycle state "terminated" for agent agent-123');
  });
});
