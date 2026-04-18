import 'dotenv/config';

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
  console.log(`[Reset] Agent: ${agentId}`);
  await resetAgentEmbedderIndexes(workspaceBasePath, agentId);
  console.log('  - indexes reset');
}

main().catch((error) => {
  console.error('[Reset] Failed to reset embedder indexes:', error);
  process.exit(1);
});
