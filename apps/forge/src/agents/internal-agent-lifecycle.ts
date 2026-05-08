import type { Database } from '../database/index';
import { forgeDebug } from '@forge-runtime/core';

import { buildHiredAgentProfile } from './hiring-profile';
import { generateHiredAgentInstructions } from './hiring-requests-handler';
import { hireInternalAgent, type HireInternalAgentInput } from './hire-agent';
import { terminateInternalAgent } from './terminate-agent';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { createAgentScheduleManager } from '../schedules/manager';
import { createCompanyCashOperations } from '../finance/company-cash-operations';
import type { InternalChatService } from '../communication/internal-chat-service';

type RunInternalHiringInput = {
  hiringRequest: string;
  additionalContext?: string;
  weeklyBudgetUsd: number;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
  internalChat: InternalChatService;
};

export async function runInternalHiring(db: Database, input: RunInternalHiringInput) {
  const hiringRh = await generateHiredAgentInstructions(db, {
    hiringRequest: input.hiringRequest,
    additionalContext: input.additionalContext,
    loaderConfig: {
      workspaceBasePath: input.workspaceBasePath,
      githubApps: input.githubApps,
      emailMailboxes: input.emailMailboxes,
      coolify: input.coolify,
      schedules: input.schedules,
      internalChat: input.internalChat,
    },
  });

  if (!hiringRh.valid) {
    throw new Error(hiringRh.error || 'Hiring process failed');
  }

  const profile = await buildHiredAgentProfile(db, {
    agentName: hiringRh.agentName,
    agentDescription: hiringRh.agentDescription,
  });
  const companyCashOperations = createCompanyCashOperations(db);
  const hired = await hireInternalAgent(db, {
    roleId: hiringRh.roleId,
    roleName: hiringRh.roleName,
    roleDescription: hiringRh.roleDescription,
    ...profile,
    instructions: hiringRh.instructions,
    weeklyBudgetUsd: input.weeklyBudgetUsd,
    workspaceBasePath: input.workspaceBasePath,
    githubApps: input.githubApps,
    emailMailboxes: input.emailMailboxes,
    coolify: input.coolify,
    schedules: input.schedules,
    internalChat: input.internalChat,
  });
  try {
    const githubApp = await (
      await input.githubApps.isConfigured()
        ? input.githubApps.createAgentApp({
            agentId: hired.agentId,
            agentName: profile.name,
          })
        : null
    );
    await companyCashOperations.recordCashOut({
      type: 'agent-hiring-process',
      amountUsd: hiringRh.costUsd,
      description: `Hiring workflow cost for ${hiringRh.roleDescription}`,
      referenceType: 'hiring-workflow',
      referenceId: hired.agentId,
    });

    return {
      agentId: hired.agentId,
      emailAddress: hired.emailAddress,
      githubAppRegistrationUrl: githubApp?.registrationUrl ?? null,
    };
  } catch (error) {
    forgeDebug({ scope: 'agents', level: 'error', message: 'Internal agent lifecycle failed', context: { error } });
    await terminateInternalAgent(db, {
      agentId: hired.agentId,
      workspaceBasePath: input.workspaceBasePath,
      githubApps: input.githubApps,
      emailMailboxes: input.emailMailboxes,
      coolify: input.coolify,
      schedules: input.schedules,
      internalChat: input.internalChat,
    });
    forgeDebug({ scope: "agents-internal-agent-lifecycle.ts", level: "error", message: "agents-internal-agent-lifecycle.ts: unhandled error", error: err instanceof Error ? err.message : String(err) });
    throw error;
  }
}

export async function runInternalTermination(db: Database, input: {
  agentId: string;
  workspaceBasePath: string;
  githubApps: RunInternalHiringInput['githubApps'];
  emailMailboxes: RunInternalHiringInput['emailMailboxes'];
  coolify: RunInternalHiringInput['coolify'];
  schedules: RunInternalHiringInput['schedules'];
  internalChat: RunInternalHiringInput['internalChat'];
}) {
  return terminateInternalAgent(db, input);
}
