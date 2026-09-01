import { describe, expect, it } from 'vitest';
import { InternalAgentLifecycleHiringError } from './internal-agent-lifecycle.errors';

describe('InternalAgentLifecycleHiringError', () => {
  it('preserves verbatim message', () => {
    const err = new InternalAgentLifecycleHiringError('Hiring process failed');
    expect(err).toBeInstanceOf(InternalAgentLifecycleHiringError);
    expect(err.name).toBe('InternalAgentLifecycleHiringError');
    expect(err.code).toBe('INTERNAL_AGENT_LIFECYCLE_HIRING');
    expect(err.reason).toBe('Hiring process failed');
    expect(err.message).toBe('Hiring process failed');
  });
});
