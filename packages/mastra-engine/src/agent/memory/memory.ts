import { fastembed } from '@mastra/fastembed';
import type { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';

import { WORKING_MEMORY_SCHEMA } from './working-memory';

export function createAgentMemory(config: {
  storage: LibSQLStore;
  vector: LibSQLVector;
}) {
  // Working memory stays enabled here; long-term memory is handled by a separate processor.
  return new Memory({
    embedder: fastembed,
    storage: config.storage,
    vector: config.vector,
    options: {
      lastMessages: 20,
      semanticRecall: false,
      observationalMemory: false,
      workingMemory: {
        enabled: true,
        scope: 'thread',
        schema: WORKING_MEMORY_SCHEMA,
      },
    },
  });
}
