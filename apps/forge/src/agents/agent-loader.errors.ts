/**
 * Typed Error subclasses for the agents/agent-loader module (Pattern L, D52 #6502 batch 35).
 */
export class AgentLoaderConfigMissingError extends Error {
  readonly code = 'AGENT_LOADER_CONFIG_MISSING' as const;
  readonly configKey: string;
  constructor(configKey: string) {
    super(`Agent loader config missing: ${configKey}`);
    this.name = 'AgentLoaderConfigMissingError';
    this.configKey = configKey;
  }
}
