import { rm } from 'node:fs/promises';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import type { Database } from '../database/index.js';
import { agents } from '../database/schema.js';
import { getInternalAgentRegistry } from './internal-agent-registry.js';
import type { GitHubAppManager } from '../github/manager.js';

export async function terminateInternalAgent(db: Database, input: {
  agentId: string;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
}) {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, input.agentId),
  });

  if (!agent) {
    throw new Error(`Agent not found: ${input.agentId}`);
  }

  getInternalAgentRegistry().remove(input.agentId);
  input.githubApps.unloadAgent(input.agentId);

  await db.delete(agents).where(eq(agents.id, input.agentId));

  const agentWorkspacePath = path.resolve(input.workspaceBasePath, input.agentId);
  await rm(agentWorkspacePath, {
    recursive: true,
    force: true,
  });

  return {
    agentId: input.agentId,
  };
}
