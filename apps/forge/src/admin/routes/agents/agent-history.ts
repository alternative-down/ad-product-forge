import { createClient } from '@libsql/client';
import { LibsqlConversationStore, toMastraSafeIdentifier } from '@forge-runtime/core';
import { eq } from 'drizzle-orm';
import path from 'node:path';

import type { Database } from '../../../database/client';
import { agentCheckpointedOmStates } from '../../../database/schema';

export async function clearAgentHistory(input: {
  db: Database;
  workspaceBasePath: string;
  agentId: string;
}): Promise<void> {
  const agentDatabasePath = path.resolve(input.workspaceBasePath, input.agentId, 'database.db');
  const client = createClient({ url: `file:${agentDatabasePath}` });
  const mastraAgentId = toMastraSafeIdentifier(input.agentId);
  const conversationStore = new LibsqlConversationStore({
    client,
    tablePrefix: mastraAgentId,
  });

  try {
    await client.execute('PRAGMA foreign_keys = ON');
    await conversationStore.clearThread(mastraAgentId);

    await input.db
      .delete(agentCheckpointedOmStates)
      .where(eq(agentCheckpointedOmStates.agentId, input.agentId));
  } finally {
    client.close();
  }
}
