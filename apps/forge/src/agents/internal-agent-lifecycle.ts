import type { Database } from '../database/index';

import { buildHiredAgentProfile } from './hiring-profile';
import { generateHiredAgentInstructions } from './hiring-rh';
import { hireInternalAgent, type HireInternalAgentInput } from './hire-agent';
import { terminateInternalAgent } from './terminate-agent';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { createAgentScheduleManager } from '../schedules/manager';
import { createCompanyCashOperations } from '../finance/company-cash-operations';

type RunInternalHiringInput = {
  hiringRequest: string;
  additionalContext?: string;
  weeklyBudgetUsd: number;
  workspaceBasePath: string;
  workflows?: HireInternalAgentInput['workflows'];
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
};

export async function runInternalHiring(db: Database, input: RunInternalHiringInput) {
  const hiringRh = await generateHiredAgentInstructions(db, {
    hiringRequest: input.hiringRequest,
    additionalContext: input.additionalContext,
    loaderConfig: {
      workspaceBasePath: input.workspaceBasePath,
      workflows: input.workflows,
      githubApps: input.githubApps,
      coolify: input.coolify,
      schedules: input.schedules,
    },
  });
  const profile = await buildHiredAgentProfile(db, {
    agentName: hiringRh.agentName,
    agentDescription: hiringRh.agentDescription,
  });
  const companyCashOperations = createCompanyCashOperations(db);
  const hired = await hireInternalAgent(db, {
    functionId: hiringRh.functionId,
    functionDescription: hiringRh.functionDescription,
    ...profile,
    instructions: hiringRh.instructions,
    weeklyBudgetUsd: input.weeklyBudgetUsd,
    workspaceBasePath: input.workspaceBasePath,
    workflows: input.workflows,
    githubApps: input.githubApps,
    emailMailboxes: input.emailMailboxes,
    coolify: input.coolify,
    schedules: input.schedules,
  });
  try {
    const githubApp = await input.githubApps.createAgentApp({
      agentId: hired.agentId,
      agentName: profile.name,
    });
    await companyCashOperations.recordCashOut({
      type: 'agent-hiring-process',
      amountUsd: hiringRh.costUsd,
      description: `Hiring workflow cost for ${hiringRh.functionDescription}`,
      referenceType: 'hiring-workflow',
      referenceId: hired.agentId,
    });

    return {
      agentId: hired.agentId,
      emailAddress: hired.emailAddress,
      githubAppRegistrationUrl: githubApp.registrationUrl,
    };
  } catch (error) {
    await terminateInternalAgent(db, {
      agentId: hired.agentId,
      workspaceBasePath: input.workspaceBasePath,
      githubApps: input.githubApps,
      emailMailboxes: input.emailMailboxes,
      schedules: input.schedules,
    });
    throw error;
  }
}

export async function runInternalTermination(db: Database, input: {
  agentId: string;
  workspaceBasePath: string;
  githubApps: RunInternalHiringInput['githubApps'];
  emailMailboxes: RunInternalHiringInput['emailMailboxes'];
  schedules: RunInternalHiringInput['schedules'];
}) {
  return terminateInternalAgent(db, input);
}
