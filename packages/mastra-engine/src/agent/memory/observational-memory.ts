import type { AgentConfig } from '@mastra/core/agent';
import type { LibSQLStore } from '@mastra/libsql';
import { ObservationalMemory } from '@mastra/memory/processors';

export const OBSERVATIONAL_MEMORY_CONFIG = {
  observation: {
    messageTokens: 15000,
    bufferTokens: 0.2,
    bufferActivation: 0.8,
    previousObserverTokens: 1000,
  },
  reflection: {
    observationTokens: 20000,
    bufferActivation: 0.5,
  },
} as const;

export function createObservationalMemory(config: {
  storage: LibSQLStore;
  model: AgentConfig['model'];
  observation?: {
    messageTokens?: number;
    bufferTokens?: number;
    bufferActivation?: number;
    previousObserverTokens?: number;
  };
  reflection?: {
    observationTokens?: number;
    bufferActivation?: number;
  };
}) {
  const observation = {
    ...OBSERVATIONAL_MEMORY_CONFIG.observation,
    ...config.observation,
  };
  const reflection = {
    ...OBSERVATIONAL_MEMORY_CONFIG.reflection,
    ...config.reflection,
  };

  return new ObservationalMemory({
    storage: config.storage.stores.memory!,
    model: config.model,
    scope: 'thread',
    observation,
    reflection,
  });
}
