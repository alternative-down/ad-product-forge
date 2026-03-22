import type { Database } from '../database/index';

import { buildHiredAgentProfile } from './hiring-profile';
import { generateHiredAgentInstructions } from './hiring-rh';
import { hireInternalAgent, type HireInternalAgentInput } from './hire-agent';
import { terminateInternalAgent } from './terminate-agent';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { createAgentScheduleManager } from '../schedules/manager';
import { createCapabilityStore } from '../capabilities/store';

type RunInternalHiringInput = {
  requestedFunction: string;
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
  const profile = await buildHiredAgentProfile(db, input);
  const hiringRh = await generateHiredAgentInstructions(db, input);
  const capabilities = createCapabilityStore(db);
  const agentFunction = await capabilities.getOrCreateFunction({
    name: input.requestedFunction,
    description: input.additionalContext,
  });
  const hired = await hireInternalAgent(db, {
    functionId: agentFunction.functionId,
    functionDescription: agentFunction.description ?? agentFunction.name,
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
