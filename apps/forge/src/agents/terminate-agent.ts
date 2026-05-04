import { rm } from 'node:fs/promises';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import type { Database } from '../database/index';
import { agents } from '../database/schema';
import { getInternalAgentRegistry } from './internal-agent-registry';
import { createAgentContractStore } from './agent-contract-store';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { createAgentScheduleManager } from '../schedules/manager';

export type TerminationResult = {
  agentId: string;
  completedSteps: string[];
};

export async function terminateInternalAgent(db: Database, input: {
  agentId: string;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
}): Promise<TerminationResult> {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, input.agentId),
  });

  if (!agent) {
    throw new Error(`Agent not found: ${input.agentId}`);
  }

  const completedSteps: string[] = [];

  // 1. Refund contract balance
  try {
    const contractStore = createAgentContractStore(db);
    await contractStore.refundActiveContractBalance(input.agentId);
    completedSteps.push('refundContract');
  } catch (err) {
    console.error(`[terminate-agent] refundActiveContractBalance failed for ${input.agentId}`, err);
  }

  // 2. Remove from internal registry
  try {
    getInternalAgentRegistry().remove(input.agentId);
    completedSteps.push('removeFromRegistry');
  } catch (err) {
    console.error(`[terminate-agent] registry.remove failed for ${input.agentId}`, err);
  }

  // 3. Remove scheduled jobs
  try {
    await input.schedules.removeAgent(input.agentId);
    completedSteps.push('removeSchedules');
  } catch (err) {
    console.error(`[terminate-agent] schedules.removeAgent failed for ${input.agentId}`, err);
  }

  // 4. Delete email mailbox
  if (input.emailMailboxes) {
    try {
      if (await input.emailMailboxes.isConfigured()) {
        await input.emailMailboxes.deleteAgentMailbox(input.agentId);
        completedSteps.push('deleteMailbox');
      }
    } catch (err) {
      console.error(`[terminate-agent] emailMailboxes.deleteAgentMailbox failed for ${input.agentId}`, err);
    }
  }

  // 5. Delete GitHub App
  try {
    await input.githubApps.deleteAgentApp(input.agentId);
    completedSteps.push('deleteGitHubApp');
  } catch (err) {
    console.error(`[terminate-agent] githubApps.deleteAgentApp failed for ${input.agentId}`, err);
  }

  // 6. Delete DB record
  try {
    await db.delete(agents).where(eq(agents.id, input.agentId));
    completedSteps.push('deleteDbRecord');
  } catch (err) {
    console.error(`[terminate-agent] db.delete failed for ${input.agentId}`, err);
  }

  // 7. Remove workspace directory
  const agentWorkspacePath = path.resolve(input.workspaceBasePath, input.agentId);
  try {
    await rm(agentWorkspacePath, { recursive: true, force: true });
    completedSteps.push('deleteWorkspace');
  } catch (err) {
    console.error(`[terminate-agent] fs.rm failed for ${agentWorkspacePath}`, err);
  }

  return {
    agentId: input.agentId,
    completedSteps,
  };
}