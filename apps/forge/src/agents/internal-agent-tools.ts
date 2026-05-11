import { createTool } from '@forge-runtime/core';
import { z } from 'zod';


import type { Database } from '../database/schema';
import { runInternalHiring, runInternalTermination } from './internal-agent-lifecycle';
import type { GitHubAppManager } from '../github/manager';
import type { AgentEmailManager } from '../email/migadu-manager';
import type { CoolifyManager } from '../coolify/manager';
import type { createAgentScheduleManager } from '../schedules/manager';
import type { InternalChatService } from '../communication/internal-chat-service';

const hireInternalAgentInputSchema = z.object({
  hiringRequest: z.string().min(1),
  additionalContext: z.string().optional(),
  weeklyBudgetUsd: z.number().positive(),
});

const hireInternalAgentOutputSchema = z.object({
  agentId: z.string(),
  emailAddress: z.string().nullable(),
  githubAppRegistrationUrl: z.string().nullable(),
});

const terminateInternalAgentInputSchema = z.object({
  agentId: z.string(),
});

const terminateInternalAgentOutputSchema = z.object({
  agentId: z.string(),
});

export function createInternalAgentTools(config: {
  db: Database;
  workspaceBasePath: string;
  githubApps: GitHubAppManager;
  emailMailboxes: AgentEmailManager | null;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
  internalChat: InternalChatService;
}) {
  return {
    hire_internal_agent: createTool({
      id: 'hire-internal-agent',
      description: 'Hire a new internal agent with a concrete role, profile, and weekly budget.',
      inputSchema: hireInternalAgentInputSchema,
      outputSchema: hireInternalAgentOutputSchema,
      execute: async (input) => {
        return await runInternalHiring(config.db, {
          ...input,
          workspaceBasePath: config.workspaceBasePath,
          githubApps: config.githubApps,
          emailMailboxes: config.emailMailboxes,
          coolify: config.coolify,
          schedules: config.schedules,
          internalChat: config.internalChat,
        });
      },
    }),
    terminate_internal_agent: createTool({
      id: 'terminate-internal-agent',
      description: 'Terminate one internal agent and clean up its provisioned resources.',
      inputSchema: terminateInternalAgentInputSchema,
      outputSchema: terminateInternalAgentOutputSchema,
      execute: async (input) => {
        return await runInternalTermination(config.db, {
          ...input,
          workspaceBasePath: config.workspaceBasePath,
          githubApps: config.githubApps,
          emailMailboxes: config.emailMailboxes,
          coolify: config.coolify,
          schedules: config.schedules,
          internalChat: config.internalChat,
        });
      },
    }),
  };
}
