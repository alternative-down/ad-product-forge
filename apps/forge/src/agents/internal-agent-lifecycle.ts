import type { Database } from '../database/index.js';

import { buildHiredAgentProfile } from './hiring-profile.js';
import { generateHiredAgentInstructions } from './hiring-rh.js';
import { hireInternalAgent, type HireInternalAgentInput } from './hire-agent.js';
import { terminateInternalAgent } from './terminate-agent.js';

type RunInternalHiringInput = {
  requestedFunction: string;
  additionalContext?: string;
  weeklyBudgetUsd: number;
  workspaceBasePath: string;
  workflows?: HireInternalAgentInput['workflows'];
};

export async function runInternalHiring(db: Database, input: RunInternalHiringInput) {
  const profile = buildHiredAgentProfile(input);
  const hiringRh = await generateHiredAgentInstructions(db, input);

  return hireInternalAgent(db, {
    ...profile,
    instructions: hiringRh.instructions,
    weeklyBudgetUsd: input.weeklyBudgetUsd,
    workspaceBasePath: input.workspaceBasePath,
    workflows: input.workflows,
  });
}

export async function runInternalTermination(db: Database, input: {
  agentId: string;
  workspaceBasePath: string;
}) {
  return terminateInternalAgent(db, input);
}
