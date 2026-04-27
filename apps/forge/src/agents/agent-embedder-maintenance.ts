import { forgeDebug } from '@forge-runtime/core';
import fs from 'node:fs/promises';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import { type WorkspaceEmbedderId } from '@forge-runtime/core';

import type { Database } from '../database';
import { agents } from '../database/schema';

export const DEFAULT_WORKSPACE_EMBEDDER: WorkspaceEmbedderId =
  'transformers-multilingual-e5-small-cpu';

export async function prepareAgentEmbeddersForStartup(input: {
  db: Database;
  workspaceBasePath: string;
}) {
  const agentRows = await input.db.query.agents.findMany();

  for (const agent of agentRows) {
    if (agent.workspaceEmbedder !== 'fastembed') {
      continue;
    }

    await resetAgentEmbedderIndexes(input.workspaceBasePath, agent.id);
    await input.db
      .update(agents)
      .set({
        workspaceEmbedder: DEFAULT_WORKSPACE_EMBEDDER,
        updatedAt: Date.now(),
      })
      .where(eq(agents.id, agent.id));
  }
}

export async function resetAgentEmbedderIndexes(workspaceBasePath: string, agentId: string) {
  const agentWorkspacePath = path.resolve(workspaceBasePath, agentId);

  await resetVectorDatabase({
    databasePath: path.resolve(agentWorkspacePath, 'database.db'),
  });
  await resetVectorDatabase({
    databasePath: path.resolve(agentWorkspacePath, `${agentId}-memory-recall.db`),
  });
  await resetVectorDatabase({
    databasePath: path.resolve(agentWorkspacePath, `${agentId}-memory.db`),
  });
}

async function resetVectorDatabase(input: {
  databasePath: string;
}) {
  const exists = await fs
    .access(input.databasePath)
    .then(() => true)
    .catch((err) => { forgeDebug({ scope: 'agent-embedder-maintenance', level: 'error', message: '[safe-catch] access check', context: { error: err } }); return false; });

  if (!exists) {
    return;
  }

  if (path.basename(input.databasePath) === 'database.db') {
    return;
  }

  await fs.rm(input.databasePath, { force: true });
}
