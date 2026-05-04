import { rm } from 'node:fs/promises';
import { forgeDebug } from '@forge-runtime/core';
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

export async function terminateInternalAgent(db: Database, input: {
  agentId: string;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
}) {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, input.agentId),
  });

  if (!agent) {
    throw new Error(`Agent not found: ${input.agentId}`);
  }

  const contractStore = createAgentContractStore(db);
  try {
    await contractStore.refundActiveContractBalance(input.agentId);
  } catch (err) {
    forgeDebug({
      scope: 'terminate-agent',
      level: 'warn',
      runtimeId: input.agentId,
      message: 'refundActiveContractBalance failed (non-fatal): ' + (err instanceof Error ? err.message : String(err)),
    });
  }

  // Perform external operations — rollback DB cleanup on any failure
  try {
    await input.schedules.removeAgent(input.agentId);

    if (input.emailMailboxes && (await input.emailMailboxes.isConfigured())) {
      await input.emailMailboxes.deleteAgentMailbox(input.agentId);
    }

    await input.githubApps.deleteAgentApp(input.agentId);
  } catch (err) {
    forgeDebug({
      scope: 'terminate-agent',
      level: 'error',
      runtimeId: input.agentId,
      message: 'external cleanup failed during terminate: ' + (err instanceof Error ? err.message : String(err)),
    });

    // Still clean up DB and registry even when external ops fail
    try {
      await db.delete(agents).where(eq(agents.id, input.agentId));
    } catch (deleteErr) {
      forgeDebug({
        scope: 'terminate-agent',
        level: 'error',
        runtimeId: input.agentId,
        message: 'DB delete failed during rollback: ' + (deleteErr instanceof Error ? deleteErr.message : String(deleteErr)),
      });
    }
    getInternalAgentRegistry().remove(input.agentId);
    throw err;
  }

  // External ops succeeded — now delete DB record and workspace
  await db.delete(agents).where(eq(agents.id, input.agentId));
  getInternalAgentRegistry().remove(input.agentId);

  const agentWorkspacePath = path.resolve(input.workspaceBasePath, input.agentId);
  await rm(agentWorkspacePath, {
    recursive: true,
    force: true,
  });

  return {
    agentId: input.agentId,
  };
}
