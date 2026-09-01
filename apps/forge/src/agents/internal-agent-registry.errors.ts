/**
 * Typed Error subclasses for the agents/internal-agent-registry module (Pattern L, D52 #6502 batch 35).
 */
export class InternalAgentRegistryReloadConfigError extends Error {
  readonly code = 'INTERNAL_AGENT_REGISTRY_RELOAD_CONFIG' as const;
  constructor() {
    super('Agent loader config is not available for runtime reload');
    this.name = 'InternalAgentRegistryReloadConfigError';
  }
}
