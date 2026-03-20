import type { Database } from '../database/index.js';

import { buildHiredAgentProfile } from './hiring-profile.js';
import { generateHiredAgentInstructions } from './hiring-rh.js';
import { hireInternalAgent, type HireInternalAgentInput } from './hire-agent.js';
import { terminateInternalAgent } from './terminate-agent.js';
import type { GitHubAppManager } from '../github/manager.js';
import type { AgentEmailManager } from '../email/migadu-manager.js';
import type { CoolifyManager } from '../coolify/manager.js';

type RunInternalHiringInput = {
  requestedFunction: string;
  additionalContext?: string;
  weeklyBudgetUsd: number;
  workspaceBasePath: string;
  workflows?: HireInternalAgentInput['workflows'];
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
};

export async function runInternalHiring(db: Database, input: RunInternalHiringInput) {
  const profile = buildHiredAgentProfile(input);
  const hiringRh = await generateHiredAgentInstructions(db, input);
  const hired = await hireInternalAgent(db, {
    ...profile,
    instructions: hiringRh.instructions,
    weeklyBudgetUsd: input.weeklyBudgetUsd,
    workspaceBasePath: input.workspaceBasePath,
    workflows: input.workflows,
    githubApps: input.githubApps,
    emailMailboxes: input.emailMailboxes,
    coolify: input.coolify,
  });
  try {
    const githubApp = await input.githubApps.ensureAgentApp({
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
    });
    throw error;
  }
}

export async function runInternalTermination(db: Database, input: {
  agentId: string;
  workspaceBasePath: string;
  githubApps: RunInternalHiringInput['githubApps'];
  emailMailboxes: RunInternalHiringInput['emailMailboxes'];
}) {
  return terminateInternalAgent(db, input);
}
