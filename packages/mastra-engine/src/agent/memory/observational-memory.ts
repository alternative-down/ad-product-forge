import type { Memory } from '@mastra/memory';
import { ObservationalMemoryProcessor } from '@mastra/memory/processors';

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

export async function createObservationalMemory(config: {
  memory: Memory;
}) {
  const engine = await config.memory.omEngine;
  if (!engine) {
    throw new Error('Observational memory engine is not enabled on Memory');
  }

  const processor = new ObservationalMemoryProcessor(engine, config.memory);

  return {
    engine,
    processor,
  };
}
