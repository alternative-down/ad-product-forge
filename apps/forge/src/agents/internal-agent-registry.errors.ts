/**
 * Typed Error subclasses for the agents/internal-agent-registry module (Pattern L, D52 #6502 batch 35).
 */
export class InternalAgentRegistryNotFoundError extends Error {
  readonly code = 'INTERNAL_AGENT_REGISTRY_NOT_FOUND' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`Internal agent not found: ${agentId}`);
    this.name = 'InternalAgentRegistryNotFoundError';
    this.agentId = agentId;
  }
}
