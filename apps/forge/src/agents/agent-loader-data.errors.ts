/**
 * Typed Error subclasses for the agents/agent-loader-data module (Pattern L, D51 #6502).
 *
 * Replaces 2 raw `throw new Error(...)` calls in agent-loader-data.ts with 2 typed Error
 * subclasses. See #6502.
 */

export class AgentLoaderDataAgentNotFoundError extends Error {
  readonly code = 'AGENT_LOADER_DATA_AGENT_NOT_FOUND' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`Agent not found in registry: ${agentId}`);
    this.name = 'AgentLoaderDataAgentNotFoundError';
    this.agentId = agentId;
  }
}

export class AgentLoaderDataMissingRoleIdError extends Error {
  readonly code = 'AGENT_LOADER_DATA_MISSING_ROLE_ID' as const;
  readonly agentId: string;
  constructor(agentId: string) {
    super(`Agent is missing roleId: ${agentId}`);
    this.name = 'AgentLoaderDataMissingRoleIdError';
    this.agentId = agentId;
  }
}
