import path from 'node:path';

import { LibSQLStore, LibSQLVector } from '@mastra/libsql';

export function createAgentStorage(agentId: string) {
  const dbPath = path.resolve(process.cwd(), `${agentId}.db`);
  const dbUrl = `file:${dbPath}`;

  return {
    storage: new LibSQLStore({ id: `${agentId}-storage`, url: dbUrl }),
    vector: new LibSQLVector({ id: `${agentId}-vector`, url: dbUrl }),
  };
}
