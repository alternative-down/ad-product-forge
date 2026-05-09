import { rm } from 'node:fs/promises';
import { forgeDebug } from '@forge-runtime/core';
import path from 'node:path';

import { eq } from 'drizzle-orm';


import type {Database} from '../database/schema';
import { agents, agentExecutionContracts } from '../database/schema';
import { getInternalAgentRegistry } from './internal-agent-registry';
import { createAgentContractStore } from './agent-contract-store';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { createAgentScheduleManager } from '../schedules/manager';
import type { InternalChatService } from '../communication/internal-chat-service';

export async function terminateInternalAgent(db: Database, input: {
  agentId: string;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
  internalChat: InternalChatService;
}) {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, input.agentId),
  });

  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
  if (!agent) {
  // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
    forgeDebug({ scope: 'terminate-agent', level: 'warn', message: 'terminateAgent: agent not found', context: { agentId: input.agentId } });
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

  // Perform external operations — compensating transaction on any failure
  try {
    await input.schedules.removeAgent(input.agentId);

    if (input.emailMailboxes && (await input.emailMailboxes.isConfigured())) {
      await input.emailMailboxes.deleteAgentMailbox(input.agentId);
    }

    await input.githubApps.deleteAgentApp(input.agentId);

    // Clean up internal chat account — best effort, non-fatal on failure
    try {
      await input.internalChat.deleteAgentAccount({ agentId: input.agentId });
    } catch (chatErr) {
      forgeDebug({
        scope: 'terminate-agent',
        level: 'warn',
        runtimeId: input.agentId,
        message: 'internal chat cleanup failed (non-fatal): ' + (chatErr instanceof Error ? chatErr.message : String(chatErr)),
      });
    }
  } catch (err) {
    forgeDebug({
      scope: 'terminate-agent',
      level: 'error',
      runtimeId: input.agentId,
      message: 'external cleanup failed during terminate: ' + (err instanceof Error ? err.message : String(err)),
    });

    // Compensating transaction: attempt cleanup of whatever succeeded before the failure.
    // Best effort — failures are logged but do not re-throw.
    try {
      await input.internalChat.deleteAgentAccount({ agentId: input.agentId });
    } catch (chatErr) {
      forgeDebug({
        scope: 'terminate-agent',
        level: 'warn',
        runtimeId: input.agentId,
        message: 'internal chat cleanup failed during rollback: ' + (chatErr instanceof Error ? chatErr.message : String(chatErr)),
      });
    }

    try {
      await db.delete(agentExecutionContracts).where(eq(agentExecutionContracts.agentId, input.agentId));
    } catch (contractErr) {
      forgeDebug({
        scope: 'terminate-agent',
        level: 'error',
        runtimeId: input.agentId,
        message: 'contract delete failed during rollback: ' + (contractErr instanceof Error ? contractErr.message : String(contractErr)),
      });
    }

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
    forgeDebug({ scope: 'terminate-agent', level: 'error', message: 'terminate-agent: operation failed', error: err instanceof Error ? err.message : String(err) });
    throw err;
  }

  // External ops succeeded — now clean up chat account, DB record, and registry
  try {
    await input.internalChat.deleteAgentAccount({ agentId: input.agentId });
  } catch (err) {
    forgeDebug({
      scope: 'terminate-agent',
      level: 'warn',
      runtimeId: input.agentId,
      message: 'internal chat cleanup failed (non-fatal): ' + (err instanceof Error ? err.message : String(err)),
    });
  }

  // Delete execution contracts — cascade handles steps and providers
  await db.delete(agentExecutionContracts).where(eq(agentExecutionContracts.agentId, input.agentId));

  await db.delete(agents).where(eq(agents.id, input.agentId));
  getInternalAgentRegistry().remove(input.agentId);

  const agentWorkspacePath = path.resolve(input.workspaceBasePath, input.agentId);
  try {
    await rm(agentWorkspacePath, {
      recursive: true,
      force: true,
    });
  } catch (rmErr) {
    forgeDebug({
      scope: 'terminate-agent',
      level: 'warn',
      runtimeId: input.agentId,
      message: 'workspace rm failed (non-fatal): ' + (rmErr instanceof Error ? rmErr.message : String(rmErr)),
    });
  }

  return {
    agentId: input.agentId,
  };
}