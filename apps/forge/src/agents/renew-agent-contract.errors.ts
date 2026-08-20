/**
 * Typed Error subclasses for the agents/renew-agent-contract module (Pattern L, D51 #6502 batch 25).
 *
 * Replaces 2 raw `throw new Error(...)` calls in renew-agent-contract.ts with 2
 * typed Error subclasses so consumers can use `err instanceof XError` instead
 * of parsing human-readable messages. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/agents/renew-agent-contract.ts collapse to 2 typed Error
 * classes. Message format is preserved verbatim for backward compatibility
 * with existing test substrings and #6015 L#NN-46 transaction semantics.
 *
 * Pattern reference: apps/forge/src/agents/hiring-requests-handler.errors.ts (D51 batch 24).
 */

export class RenewAgentContractNoActiveContractError extends Error {
  readonly code = 'RENEW_AGENT_CONTRACT_NO_ACTIVE_CONTRACT' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`No active contract for agent: ${agentId}`);
    this.name = 'RenewAgentContractNoActiveContractError';
    this.agentId = agentId;
  }
}

export class RenewAgentContractInsufficientCashError extends Error {
  readonly code = 'RENEW_AGENT_CONTRACT_INSUFFICIENT_CASH' as const;
  constructor() {
    super('Insufficient company cash to renew this contract');
    this.name = 'RenewAgentContractInsufficientCashError';
  }
}
