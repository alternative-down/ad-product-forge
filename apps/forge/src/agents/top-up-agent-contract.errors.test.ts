/**
 * Tests for Pattern L typed Errors in agents/top-up-agent-contract module (D51 #6502 batch 26).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields (agentId) are exposed on the error for downstream consumers
 *
 * See apps/forge/src/agents/top-up-agent-contract.errors.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  TopUpAgentContractInsufficientCashError,
  TopUpAgentContractNoActiveContractError,
} from './top-up-agent-contract.errors';

describe('top-up-agent-contract — Pattern L typed Errors (D51 #6502 batch 26)', () => {
  it('TopUpAgentContractNoActiveContractError captures agentId and preserves message', () => {
    const agentId = 'agent-99';
    const error = new TopUpAgentContractNoActiveContractError(agentId);
    expect(error).toBeInstanceOf(TopUpAgentContractNoActiveContractError);
    expect(error.code).toBe('TOP_UP_AGENT_CONTRACT_NO_ACTIVE_CONTRACT');
    expect(error.agentId).toBe(agentId);
    expect(error.message).toContain('No active contract for agent');
    expect(error.message).toContain(agentId);
  });

  it('TopUpAgentContractInsufficientCashError has discriminator and preserved message', () => {
    const error = new TopUpAgentContractInsufficientCashError();
    expect(error).toBeInstanceOf(TopUpAgentContractInsufficientCashError);
    expect(error.code).toBe('TOP_UP_AGENT_CONTRACT_INSUFFICIENT_CASH');
    expect(error.message).toBe('Insufficient company cash for contract top-up');
  });
});
