import 'dotenv/config';
import { forgeDebug } from '@forge-runtime/core';

import { z } from 'zod';

import { resetAgentEmbedderIndexes } from '../agents/agent-embedder-maintenance';

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
  forgeDebug({ scope: 'reset-embedder', level: 'info', message: 'Processing agent', context: { agentId } });
  await resetAgentEmbedderIndexes(workspaceBasePath, agentId);
  // Indexes reset logged above
}

main().catch((error) => {
  forgeDebug({ scope: 'reset-embedder', level: 'error', message: 'Failed to reset embedder indexes', context: { agentId, error } });
  process.exit(1);
});
