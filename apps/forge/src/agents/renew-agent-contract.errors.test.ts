/**
 * Tests for Pattern L typed Errors in agents/renew-agent-contract module (D51 #6502 batch 25).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields (agentId) are exposed on the error for downstream consumers
 *
 * See apps/forge/src/agents/renew-agent-contract.errors.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  RenewAgentContractInsufficientCashError,
  RenewAgentContractNoActiveContractError,
} from './renew-agent-contract.errors';

describe('renew-agent-contract — Pattern L typed Errors (D51 #6502 batch 25)', () => {
  it('RenewAgentContractNoActiveContractError captures agentId and preserves message', () => {
    const agentId = 'agent-77';
    const error = new RenewAgentContractNoActiveContractError(agentId);
    expect(error).toBeInstanceOf(RenewAgentContractNoActiveContractError);
    expect(error.code).toBe('RENEW_AGENT_CONTRACT_NO_ACTIVE_CONTRACT');
    expect(error.agentId).toBe(agentId);
    expect(error.message).toContain('No active contract for agent');
    expect(error.message).toContain(agentId);
  });

  it('RenewAgentContractInsufficientCashError has discriminator and preserved message', () => {
    const error = new RenewAgentContractInsufficientCashError();
    expect(error).toBeInstanceOf(RenewAgentContractInsufficientCashError);
    expect(error.code).toBe('RENEW_AGENT_CONTRACT_INSUFFICIENT_CASH');
    expect(error.message).toBe('Insufficient company cash to renew this contract');
  });
});
