import { describe, expect, it } from 'vitest';
import { AgentOperationSendError } from './operations.errors';

describe('AgentOperationSendError', () => {
  it('preserves verbatim cause as message', () => {
    const err = new AgentOperationSendError('agent not registered');
    expect(err).toBeInstanceOf(AgentOperationSendError);
    expect(err.name).toBe('AgentOperationSendError');
    expect(err.code).toBe('AGENT_OPERATION_SEND_ERROR');
    expect(err.cause).toBe('agent not registered');
    expect(err.message).toBe('agent not registered');
  });
});
