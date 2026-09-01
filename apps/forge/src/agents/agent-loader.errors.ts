/**
 * Typed Error subclasses for the agents/agent-loader module (Pattern L, D52 #6502 batch 35).
 */
export class AgentLoaderMissingCapabilityError extends Error {
  readonly code = 'AGENT_LOADER_MISSING_CAPABILITY' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`Agent loader: capability check failed for ${agentId}`);
    this.name = 'AgentLoaderMissingCapabilityError';
    this.agentId = agentId;
  }
}
