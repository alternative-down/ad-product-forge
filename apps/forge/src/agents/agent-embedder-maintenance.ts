import { forgeDebug } from '@forge-runtime/core';
import fs from 'node:fs/promises';
import path from 'node:path';

import { eq } from 'drizzle-orm';
import { type WorkspaceEmbedderId } from '@forge-runtime/core';

import type { Database } from '../database/schema';
import { agents } from '../database/schema';

const CONCURRENCY_LIMIT = 4;

async function withConcurrencyLimit<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  for (let i = 0; i < items.length; i += CONCURRENCY_LIMIT) {
    const batch = items.slice(i, i + CONCURRENCY_LIMIT);
    await Promise.all(batch.map(fn));
  }
}

export const DEFAULT_WORKSPACE_EMBEDDER: WorkspaceEmbedderId =
  'transformers-multilingual-e5-small-cpu';

export async function prepareAgentEmbeddersForStartup(input: {
  db: Database;
  workspaceBasePath: string;
}) {
  const agentRows = await input.db.query.agents.findMany();

  const fastembedAgents = agentRows.filter(
    (agent: { id: string; workspaceEmbedder?: string }) => agent.workspaceEmbedder === 'fastembed',
  );

  await withConcurrencyLimit(fastembedAgents, async (agent) => {
    await resetAgentEmbedderIndexes(input.workspaceBasePath, agent.id);
    await input.db
      .update(agents)
      .set({
        workspaceEmbedder: DEFAULT_WORKSPACE_EMBEDDER,
        updatedAt: Date.now(),
      })
      .where(eq(agents.id, agent.id));
  });
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

async function resetVectorDatabase(input: { databasePath: string }) {
  const exists = await fs
    .access(input.databasePath)
    .then(() => true)
    .catch((err) => {
      forgeDebug({
        scope: 'agent-embedder-maintenance',
        level: 'error',
        message: '[safe-catch] access check',
        context: { error: err instanceof Error ? err.message : String(err) },
      });
      return false;
    });

  if (!exists) {
    return;
  }

  if (path.basename(input.databasePath) === 'database.db') {
    return;
  }

  await fs.rm(input.databasePath, { force: true });
}
