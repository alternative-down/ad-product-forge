import type { AgentConfig } from '@mastra/core/agent';
import type { LibSQLStore } from '@mastra/libsql';
import { ObservationalMemory } from '@mastra/memory/processors';

export const OBSERVATIONAL_MEMORY_CONFIG = {
  observation: { messageTokens: 15000 },
  reflection: { observationTokens: 20000 },
} as const;

export function createObservationalMemory(config: {
  storage: LibSQLStore;
  model: AgentConfig['model'];
}) {
  return new ObservationalMemory({
    storage: config.storage.stores.memory!,
    model: config.model,
    scope: 'thread',
    observation: OBSERVATIONAL_MEMORY_CONFIG.observation,
    reflection: OBSERVATIONAL_MEMORY_CONFIG.reflection,
  });
}
