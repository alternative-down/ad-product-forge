import { LibSQLStore, LibSQLVector } from '@mastra/libsql';

export function createAgentStorage(agentId: string) {
  const dbUrl = `file:./${agentId}.db`;

  return {
    storage: new LibSQLStore({ id: `${agentId}-storage`, url: dbUrl }),
    vector: new LibSQLVector({ id: `${agentId}-vector`, url: dbUrl }),
  };
}
