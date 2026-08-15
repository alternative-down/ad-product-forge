import {  errorMsg } from './error-formatting';
import { rm } from 'node:fs/promises';
import { terminateInternalAgentDebug } from './terminate-agent-debug-helpers';
import path from 'node:path';

import { eq } from 'drizzle-orm';

import type { Database } from '../database/client';
import { agents, agentExecutionContracts, agentProviders } from '../database/schema';
import { getInternalAgentRegistry } from './internal-agent-registry';
import { createAgentContractStore } from './agent-contract-store';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { AgentScheduleManager } from '../schedules/manager/index';
import type { InternalChatService } from '../communication/internal-chat-service';

export async function terminateInternalAgent(
  db: Database,
  input: {
    agentId: string;
    workspaceBasePath: string;
    githubApps: GitHubAppManager;
    emailMailboxes: AgentEmailManager | null;
    coolify: CoolifyManager | null;
    schedules: AgentScheduleManager;
    internalChat: InternalChatService;
  },
) {
  let agent;
  try {
    agent = await db.query.agents.findFirst({
      where: eq(agents.id, input.agentId),
    });
  } catch (err) {
    terminateInternalAgentDebug('error', 'terminateAgent DB read failed', { agentId: input.agentId, error: errorMsg(err) });
    throw err;
  }

  if (agent === null || agent === undefined) {
    terminateInternalAgentDebug('warn', 'terminateAgent: agent not found', { agentId: input.agentId });
    throw new Error(`Agent not found: ${input.agentId}`);
  }

  const contractStore = createAgentContractStore(db);
  try {
    await contractStore.refundActiveContractBalance(input.agentId);
  } catch (err) {
    terminateInternalAgentDebug('warn', 'refundActiveContractBalance failed (non-fatal): ' + errorMsg(err), { agentId: input.agentId });
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
      terminateInternalAgentDebug('warn', 'internal chat cleanup failed (non-fatal): ' + errorMsg(chatErr), { agentId: input.agentId });
    }
  } catch (err) {
    terminateInternalAgentDebug('error', 'external cleanup failed during terminate: ' + errorMsg(err), { agentId: input.agentId });

    // Compensating transaction: attempt cleanup of whatever succeeded before the failure.
    // Best effort — failures are logged but do not re-throw.
    try {
      await input.internalChat.deleteAgentAccount({ agentId: input.agentId });
    } catch (chatErr) {
      terminateInternalAgentDebug('warn', 'internal chat cleanup failed during rollback: ' +
          errorMsg(chatErr), { agentId: input.agentId });
    }

    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(agentExecutionContracts)
          .where(eq(agentExecutionContracts.agentId, input.agentId));
        await tx.delete(agentProviders).where(eq(agentProviders.agentId, input.agentId));
        await tx.delete(agents).where(eq(agents.id, input.agentId));
      });
    } catch (deleteErr) {
      terminateInternalAgentDebug('error', 'db cleanup transaction failed during rollback: ' +
          errorMsg(deleteErr), { agentId: input.agentId });
    }
    getInternalAgentRegistry().remove(input.agentId);
    throw err;
  }

  // External ops succeeded — now clean up chat account, DB record, and registry
  try {
    await input.internalChat.deleteAgentAccount({ agentId: input.agentId });
  } catch (err) {
    terminateInternalAgentDebug('warn', 'internal chat cleanup failed (non-fatal): ' + errorMsg(err), { agentId: input.agentId });
  }

  // Delete execution contracts (cascade handles steps); delete providers explicitly.
  // All 3 deletes in one transaction — any failure rolls back the full cascade.
  await db.transaction(async (tx) => {
    await tx
      .delete(agentExecutionContracts)
      .where(eq(agentExecutionContracts.agentId, input.agentId));
    await tx.delete(agentProviders).where(eq(agentProviders.agentId, input.agentId));
    await tx.delete(agents).where(eq(agents.id, input.agentId));
  });
  getInternalAgentRegistry().remove(input.agentId);

  const agentWorkspacePath = path.resolve(input.workspaceBasePath, input.agentId);
  try {
    await rm(agentWorkspacePath, {
      recursive: true,
      force: true,
    });
  } catch (rmErr) {
    terminateInternalAgentDebug('warn', 'workspace rm failed (non-fatal): ' + errorMsg(rmErr), { agentId: input.agentId });
  }

  return {
    agentId: input.agentId,
  };
}
