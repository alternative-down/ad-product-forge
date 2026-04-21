import fs from 'node:fs/promises';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import { LibSQLVector } from '@mastra/libsql';
import { toForgeSafeIdentifier, type WorkspaceEmbedderId } from '@forge-runtime/core';

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
  const mastraId = toForgeSafeIdentifier(agentId);

  await resetVectorDatabase({
    databasePath: path.resolve(agentWorkspacePath, 'database.db'),
    vectorId: `${mastraId}_vector`,
  });
  await resetVectorDatabase({
    databasePath: path.resolve(agentWorkspacePath, `${agentId}-memory-recall.db`),
    vectorId: `${mastraId}_memory_recall_vector`,
  });
  await resetVectorDatabase({
    databasePath: path.resolve(agentWorkspacePath, `${agentId}-memory.db`),
    vectorId: `${mastraId}_memory_vector`,
  });
}

async function resetVectorDatabase(input: {
  databasePath: string;
  vectorId: string;
}) {
  const exists = await fs
    .access(input.databasePath)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    return;
  }

  const vector = new LibSQLVector({
    id: input.vectorId,
    url: `file:${input.databasePath}`,
  });
  const indexes = await vector.listIndexes();

  for (const indexName of indexes) {
    await vector.deleteIndex({ indexName });
  }
}
