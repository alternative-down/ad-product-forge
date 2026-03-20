import { z } from 'zod';
import { createStep, createWorkflow, type AnyWorkflow } from '@mastra/core/workflows';

import type { Database } from '../database/index.js';
import { runInternalHiring, runInternalTermination } from '../agents/internal-agent-lifecycle.js';
import type { GitHubAppManager } from '../github/manager.js';

const hireInternalAgentInputSchema = z.object({
  requestedFunction: z.string().min(1),
  additionalContext: z.string().optional(),
  weeklyBudgetUsd: z.number().positive(),
});

const hireInternalAgentOutputSchema = z.object({
  agentId: z.string(),
  githubAppRegistrationUrl: z.string().url(),
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
}) {
  let workflows: InternalAgentWorkflows;

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

  workflows = {
    hireInternalAgent: hireWorkflow,
    terminateInternalAgent: terminateWorkflow,
  };

  return workflows;
}
