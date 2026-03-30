import { fastembed } from '@mastra/fastembed';
import type { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';

import { WORKING_MEMORY_TEMPLATE } from './working-memory';

export function createAgentMemory(config: {
  storage: LibSQLStore;
  vector: LibSQLVector;
}) {
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
        template: WORKING_MEMORY_TEMPLATE,
      },
    },
  });
}
