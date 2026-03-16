import path from 'node:path';

import { createClient } from '@libsql/client';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';

export function createAgentStorage(agentId: string, dbPath?: string) {
  const databasePath = dbPath || path.resolve(process.cwd(), `${agentId}.db`);
  const dbUrl = `file:${databasePath}`;
  const client = createClient({ url: dbUrl });

  return {
    client,
    storage: new LibSQLStore({ id: `${agentId}-storage`, client }),
    vector: new LibSQLVector({ id: `${agentId}-vector`, url: dbUrl }),
  };
}
