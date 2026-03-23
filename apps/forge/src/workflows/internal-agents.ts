import { z } from 'zod';
import { createStep, createWorkflow, type AnyWorkflow } from '@mastra/core/workflows';

import type { Database } from '../database/index';
import { runInternalHiring, runInternalTermination } from '../agents/internal-agent-lifecycle';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { createAgentScheduleManager } from '../schedules/manager';

const hireInternalAgentInputSchema = z.object({
  hiringRequest: z.string().min(1),
  additionalContext: z.string().optional(),
  weeklyBudgetUsd: z.number().positive(),
});

const hireInternalAgentOutputSchema = z.object({
  agentId: z.string(),
  emailAddress: z.string().nullable(),
  githubAppRegistrationUrl: z.string(),
});

const terminateInternalAgentInputSchema = z.object({
  agentId: z.string(),
});

const terminateInternalAgentOutputSchema = z.object({
  agentId: z.string(),
});

type InternalAgentWorkflows = {
  hireInternalAgent: AnyWorkflow;
  terminateInternalAgent: AnyWorkflow;
};

export function createInternalAgentWorkflows(config: {
  db: Database;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
}) {
  const workflows = {} as InternalAgentWorkflows;

  const hireStep = createStep({
    id: 'hire-internal-agent',
    inputSchema: hireInternalAgentInputSchema,
    outputSchema: hireInternalAgentOutputSchema,
    execute: async ({ inputData }) => {
      return runInternalHiring(config.db, {
        ...inputData,
        workspaceBasePath: config.workspaceBasePath,
        workflows,
        githubApps: config.githubApps,
        emailMailboxes: config.emailMailboxes,
        coolify: config.coolify,
        schedules: config.schedules,
      });
    },
  });

  const terminateStep = createStep({
    id: 'terminate-internal-agent',
    inputSchema: terminateInternalAgentInputSchema,
    outputSchema: terminateInternalAgentOutputSchema,
    execute: async ({ inputData }) => {
      return runInternalTermination(config.db, {
        ...inputData,
        workspaceBasePath: config.workspaceBasePath,
        githubApps: config.githubApps,
        emailMailboxes: config.emailMailboxes,
        coolify: config.coolify,
        schedules: config.schedules,
      });
    },
  });

  const hireWorkflow = createWorkflow({
    id: 'hire-internal-agent',
    inputSchema: hireInternalAgentInputSchema,
    outputSchema: hireInternalAgentOutputSchema,
  })
    .then(hireStep)
    .commit();

  const terminateWorkflow = createWorkflow({
    id: 'terminate-internal-agent',
    inputSchema: terminateInternalAgentInputSchema,
    outputSchema: terminateInternalAgentOutputSchema,
  })
    .then(terminateStep)
    .commit();

  workflows.hireInternalAgent = hireWorkflow;
  workflows.terminateInternalAgent = terminateWorkflow;

  return workflows;
}
