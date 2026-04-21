import type { AgentConfig } from '@mastra/core/agent';
import type { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';

import {
  getWorkspaceEmbedderProvider,
  type WorkspaceEmbedderId,
} from './embedder';
import { WORKING_MEMORY_SCHEMA } from './working-memory';

export function createAgentMemory(config: {
  storage: LibSQLStore;
  vector: LibSQLVector;
  embedder?: WorkspaceEmbedderId;
  lastMessages?: number;
  observationalMemory?: {
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
  };
}) {
  const observationalMemory = config.observationalMemory
    ? {
        model: config.observationalMemory.model,
        scope: 'thread' as const,
        observation: config.observationalMemory.observation,
        reflection: config.observationalMemory.reflection,
      }
    : false;

  return new Memory({
    embedder: getWorkspaceEmbedderProvider(config.embedder),
    storage: config.storage,
    vector: config.vector,
    options: {
      ...(typeof config.lastMessages === 'number'
        ? { lastMessages: config.lastMessages }
        : {}),
      semanticRecall: false,
      observationalMemory,
      workingMemory: {
        enabled: true,
        scope: 'thread' as const,
        schema: WORKING_MEMORY_SCHEMA,
      },
    },
  });
}
