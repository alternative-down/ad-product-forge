import 'dotenv/config';

import fs from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';
import { LibSQLVector } from '@mastra/libsql';
import { toMastraSafeIdentifier } from '@mastra-engine/core';

const inputSchema = z.object({
  workspaceBasePath: z.string().min(1),
  agentIds: z.array(z.string().min(1)).min(1),
});

async function main() {
  const input = inputSchema.parse({
    workspaceBasePath: process.env.WORKSPACE_BASE_PATH ?? './workspaces',
    agentIds: process.argv.slice(2),
  });

  for (const agentId of input.agentIds) {
    await resetAgentIndexes(input.workspaceBasePath, agentId);
  }
}

async function resetAgentIndexes(workspaceBasePath: string, agentId: string) {
  const agentWorkspacePath = path.resolve(workspaceBasePath, agentId);
  const mastraId = toMastraSafeIdentifier(agentId);

  console.log(`[Reset] Agent: ${agentId}`);

  await resetVectorDatabase({
    label: 'runtime',
    databasePath: path.resolve(agentWorkspacePath, 'database.db'),
    vectorId: `${mastraId}_vector`,
  });
  await resetVectorDatabase({
    label: 'ltm-recall',
    databasePath: path.resolve(agentWorkspacePath, `${agentId}-memory-recall.db`),
    vectorId: `${mastraId}_memory_recall_vector`,
  });
  await resetVectorDatabase({
    label: 'ltm-legacy',
    databasePath: path.resolve(agentWorkspacePath, `${agentId}-memory.db`),
    vectorId: `${mastraId}_memory_vector`,
  });
}

async function resetVectorDatabase(input: {
  label: string;
  databasePath: string;
  vectorId: string;
}) {
  const exists = await fs
    .access(input.databasePath)
    .then(() => true)
    .catch(() => false);

  if (!exists) {
    console.log(`  - ${input.label}: skipped (${input.databasePath} missing)`);
    return;
  }

  const vector = new LibSQLVector({
    id: input.vectorId,
    url: `file:${input.databasePath}`,
  });
  const indexes = await vector.listIndexes();

  if (indexes.length === 0) {
    console.log(`  - ${input.label}: no indexes`);
    return;
  }

  for (const indexName of indexes) {
    await vector.deleteIndex({ indexName });
    console.log(`  - ${input.label}: deleted ${indexName}`);
  }
}

main().catch((error) => {
  console.error('[Reset] Failed to reset embedder indexes:', error);
  process.exit(1);
});
