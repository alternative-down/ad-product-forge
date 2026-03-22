import { rm } from 'node:fs/promises';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import type { Database } from '../database/index';
import { agents } from '../database/schema';
import { getInternalAgentRegistry } from './internal-agent-registry';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { createAgentScheduleManager } from '../schedules/manager';

export async function terminateInternalAgent(db: Database, input: {
  agentId: string;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
}) {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, input.agentId),
  });

  if (!agent) {
    throw new Error(`Agent not found: ${input.agentId}`);
  }

  getInternalAgentRegistry().remove(input.agentId);
  await input.schedules.removeAgent(input.agentId);

  if (!input.emailMailboxes) {
    throw new Error('Migadu email provisioning is required for termination but is not configured');
  }

  await input.emailMailboxes.deleteAgentMailbox(input.agentId);
  await input.githubApps.deleteAgentApp(input.agentId);

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
