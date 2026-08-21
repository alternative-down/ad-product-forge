/**
 * Typed Error subclasses for the agents/terminate-agent module (Pattern L, D52 #6502 batch 34).
 */
export class TerminateAgentNotFoundError extends Error {
  readonly code = 'TERMINATE_AGENT_NOT_FOUND' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`Agent not found: ${agentId}`);
    this.name = 'TerminateAgentNotFoundError';
    this.agentId = agentId;
  }
}
