import { describe, expect, it } from 'vitest';

import {
  LtmRuntimeSessionNotAvailableError,
  LtmGenerateProducedNoResultError,
} from './agent-long-term-memory.errors';

describe('LtmRuntimeSessionNotAvailableError', () => {
  it('preserves verbatim message with agent id', () => {
    const err = new LtmRuntimeSessionNotAvailableError('agent-123');
    expect(err).toBeInstanceOf(LtmRuntimeSessionNotAvailableError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LtmRuntimeSessionNotAvailableError');
    expect(err.code).toBe('LTM_RUNTIME_SESSION_NOT_AVAILABLE');
    expect(err.agentId).toBe('agent-123');
    expect(err.message).toBe('LTM runtime session is not available for agent-123');
    expect(err.stack).toBeDefined();
  });

  it('handles uuid-style agent id', () => {
    const err = new LtmRuntimeSessionNotAvailableError(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
    expect(err.message).toBe(
      'LTM runtime session is not available for a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
    expect(err.agentId).toBe(
      'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
    );
  });
});

describe('LtmGenerateProducedNoResultError', () => {
  it('preserves verbatim message format for exhausted retries', () => {
    const err = new LtmGenerateProducedNoResultError('agent-456');
    expect(err).toBeInstanceOf(LtmGenerateProducedNoResultError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('LtmGenerateProducedNoResultError');
    expect(err.code).toBe('LTM_GENERATE_PRODUCED_NO_RESULT');
    expect(err.agentId).toBe('agent-456');
    expect(err.message).toBe('LTM generate produced no result for agent-456');
  });
});
