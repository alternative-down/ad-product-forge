import { z } from 'zod';

export const agentIdQuerySchema = z.object({
  agentId: z.string().min(1),
});

export const githubManifestConfigSchema = z.object({
  permissions: z.object({
    administration: z.boolean(),
    contents: z.boolean(),
    issues: z.boolean(),
    metadata: z.boolean(),
    organization_projects: z.boolean(),
    pull_requests: z.boolean(),
    repository_projects: z.boolean(),
    workflows: z.boolean(),
  }),
  events: z.object({
    push: z.boolean(),
    pull_request: z.boolean(),
    pull_request_review: z.boolean(),
    issues: z.boolean(),
    issue_comment: z.boolean(),
    repository: z.boolean(),
    workflow_run: z.boolean(),
  }),
});

export const updateAgentGitHubManifestConfigSchema = z.object({
  agentId: z.string().min(1),
  manifestConfig: githubManifestConfigSchema,
});

export const agentExecutionStepsQuerySchema = z.object({
  agentId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const agentThreadMessagesQuerySchema = z.object({
  agentId: z.string().min(1),
  page: z.coerce.number().int().min(0).default(0),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

export const agentConversationMessagesQuerySchema = z.object({
  agentId: z.string().min(1),
  provider: z.string().min(1),
  targetKey: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const agentActionSchema = z.object({
  agentId: z.string().min(1),
});

export const clearAgentHistorySchema = z.object({
  agentId: z.string().min(1),
  includeLongTermMemoryThread: z.boolean().default(true),
});

export const agentLongTermMemoryRecallSearchSchema = z.object({
  agentId: z.string().min(1),
  query: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

// =============================================================================
// ROLE SCHEMAS
// =============================================================================

export const topUpAgentContractSchema = z.object({
  agentId: z.string().min(1),
  amountUsd: z.number().positive(),
});

export const adjustAgentContractBudgetSchema = z.object({
  agentId: z.string().min(1),
  newBudgetUsd: z.number().positive(),
});

export const renewAgentContractSchema = z.object({
  agentId: z.string().min(1),
  newBudgetUsd: z.number().positive(),
});

// =============================================================================
// AGENT MANAGEMENT SCHEMAS
// =============================================================================

export const hireAgentSchema = z.object({
  hiringRequest: z.string().min(1),
  additionalContext: z.string().optional(),
  weeklyBudgetUsd: z.number().positive(),
});

export const terminateAgentSchema = z.object({
  agentId: z.string().min(1),
});

export const changeAgentRoleSchema = z.object({
  agentId: z.string().min(1),
  roleId: z.string().min(1),
});

export const updateAgentConfigSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().optional(),
  description: z.string().optional(),
  instructions: z.string().optional(),
  workspaceAutoSync: z.boolean().optional(),
  workspaceBm25: z.boolean().optional(),
  modelProfileId: z.string().optional(),
  omModelProfileId: z.string().optional(),
});

// =============================================================================
// AGENT PROVIDER SCHEMAS
// =============================================================================
