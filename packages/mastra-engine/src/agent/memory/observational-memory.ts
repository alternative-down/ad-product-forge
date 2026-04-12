import type { AgentConfig } from '@mastra/core/agent';
import type { LibSQLStore } from '@mastra/libsql';
import type { Memory } from '@mastra/memory';
import { ObservationalMemory, ObservationalMemoryProcessor } from '@mastra/memory/processors';

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
  memory: Memory;
  model: AgentConfig['model'];
  observation?: {
    messageTokens?: number;
    bufferTokens?: number | false;
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

  const engine = new ObservationalMemory({
    storage: config.storage.stores.memory!,
    model: config.model,
    scope: 'thread',
    observation,
    reflection,
  });

  const processor = new ObservationalMemoryProcessor(engine, config.memory);

  return {
    engine,
    processor,
  };
}
