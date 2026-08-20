/**
 * Typed Error subclasses for the agents/top-up-agent-contract module (Pattern L, D51 #6502 batch 26).
 *
 * Replaces 2 raw `throw new Error(...)` calls in top-up-agent-contract.ts with 2
 * typed Error subclasses so consumers can use `err instanceof XError` instead
 * of parsing human-readable messages. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/agents/top-up-agent-contract.ts collapse to 2 typed Error
 * classes. Message format is preserved verbatim for backward compatibility
 * with existing test substrings and #6015 L#NN-46 transaction semantics.
 *
 * Pattern reference: apps/forge/src/agents/renew-agent-contract.errors.ts (D51 batch 25).
 */

export class TopUpAgentContractNoActiveContractError extends Error {
  readonly code = 'TOP_UP_AGENT_CONTRACT_NO_ACTIVE_CONTRACT' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`No active contract for agent: ${agentId}`);
    this.name = 'TopUpAgentContractNoActiveContractError';
    this.agentId = agentId;
  }
}

export class TopUpAgentContractInsufficientCashError extends Error {
  readonly code = 'TOP_UP_AGENT_CONTRACT_INSUFFICIENT_CASH' as const;
  constructor() {
    super('Insufficient company cash for contract top-up');
    this.name = 'TopUpAgentContractInsufficientCashError';
  }
}
