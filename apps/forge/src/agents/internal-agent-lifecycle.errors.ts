/**
 * Typed Error subclasses for the agents/internal-agent-lifecycle module (Pattern L, D52 #6502 batch 35).
 */
export class InternalAgentLifecycleInvalidStateError extends Error {
  readonly code = 'INTERNAL_AGENT_LIFECYCLE_INVALID_STATE' as const;
  readonly agentId: string;
  readonly currentState: string;
  constructor(agentId: string, currentState: string) {
    super(`Invalid lifecycle state "${currentState}" for agent ${agentId}`);
    this.name = 'InternalAgentLifecycleInvalidStateError';
    this.agentId = agentId;
    this.currentState = currentState;
  }
}
