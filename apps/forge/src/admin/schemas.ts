import { z } from 'zod';
import type { Database } from 'drizzle-orm/sqlite-core';
import type { AgentLoaderConfig } from '../../config/loader.js';
import type { AgentScheduleManager } from '../../agents/schedules.js';
import type { GitHubAppManager } from '../../integrations/github/types.js';
import type { AgentEmailManager } from '../../integrations/email/types.js';
import type { CoolifyManager } from '../../integrations/coolify.js';
import type { SystemIntegrationStore } from '../../integrations/system/store.js';
import type { InternalChatService } from '../../internal-chat/service.js';
import type { AgentRuntimeModel } from '../../llm/factory.js';
import type { CompanyCashOperations } from '../../finance/company-cash.js';
import type { CompanyPayables } from '../../finance/company-payables.js';

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

export const roleToolPermissionSchema = z.object({
  roleId: z.string().min(1),
  toolName: z.string().min(1),
});

export const roleWorkflowPermissionSchema = z.object({
  roleId: z.string().min(1),
  workflowName: z.string().min(1),
});

export const roleCapabilitySchema = z.object({
  roleId: z.string().min(1),
  capability: z.string().min(1),
});

export const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
});

export const deleteRoleSchema = z.object({
  roleId: z.string().min(1),
});

export const createScheduleSchema = z.object({
  agentId: z.string().min(1),
  cronExpression: z.string().min(1),
  taskName: z.string().min(1),
  taskDescription: z.string().optional(),
  enabled: z.boolean().default(true),
});

export const updateScheduleSchema = z.object({
  scheduleId: z.string().min(1),
  cronExpression: z.string().min(1).optional(),
  taskName: z.string().min(1).optional(),
  taskDescription: z.string().optional(),
  enabled: z.boolean().optional(),
});

export const deleteScheduleSchema = z.object({
  scheduleId: z.string().min(1),
});

export const agentActionSchema = z.object({
  agentId: z.string().min(1),
  action: z.enum(['pause', 'resume', 'stop']),
});

export const clearAgentHistorySchema = z.object({
  agentId: z.string().min(1),
  confirmation: z.literal('CONFIRM'),
});

export const agentLongTermMemoryRecallSearchSchema = z.object({
  agentId: z.string().min(1),
  query: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

export const adminInternalChatSendSchema = z.object({
  agentId: z.string().min(1),
  targetKey: z.string().min(1),
  content: z.string().min(1),
  replyToMessageId: z.string().optional(),
});

export const createExternalInternalChatAccountSchema = z.object({
  agentId: z.string().min(1),
  provider: z.string().min(1),
});

export const updateExternalInternalChatAccountSchema = z.object({
  accountId: z.string().min(1),
  enabled: z.boolean(),
});

export const deleteExternalInternalChatAccountSchema = z.object({
  accountId: z.string().min(1),
});

export const internalChatAccountIdQuerySchema = z.object({
  accountId: z.string().min(1),
});

export const internalChatMessagesQuerySchema = z.object({
  accountId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
  beforeMessageId: z.string().optional(),
});

export const internalChatMessageAttachmentQuerySchema = z.object({
  accountId: z.string().min(1),
  messageId: z.string().min(1),
});

export const createInternalChatConversationSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  memberTargetKeys: z.array(z.string()).min(2),
});

export const sendInternalChatConversationMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1),
  replyToMessageId: z.string().optional(),
});

export const updateInternalChatConversationSchema = z.object({
  conversationId: z.string().min(1),
  name: z.string().min(1),
});

export const archiveInternalChatConversationSchema = z.object({
  conversationId: z.string().min(1),
});

export const internalChatGroupMembersQuerySchema = z.object({
  conversationId: z.string().min(1),
});

export const addInternalChatGroupMemberSchema = z.object({
  conversationId: z.string().min(1),
  targetKey: z.string().min(1),
  role: z.enum(['admin', 'normal']).default('normal'),
});

export const updateInternalChatGroupMemberRoleSchema = z.object({
  conversationId: z.string().min(1),
  memberId: z.string().min(1),
  role: z.enum(['admin', 'normal']),
});

export const removeInternalChatGroupMemberSchema = z.object({
  conversationId: z.string().min(1),
  memberId: z.string().min(1),
});

export const topUpAgentContractSchema = z.object({
  contractId: z.string().min(1),
  amountUsd: z.coerce.number().min(0),
});

export const adjustAgentContractBudgetSchema = z.object({
  contractId: z.string().min(1),
  newBudgetUsd: z.coerce.number().min(0),
});

export const renewAgentContractSchema = z.object({
  contractId: z.string().min(1),
  newWeeklyBudgetUsd: z.coerce.number().positive(),
  newWeeklyHoursLimit: z.coerce.number().positive().optional(),
});

export const hireAgentSchema = z.object({
  agentId: z.string().min(1),
  weeklyBudgetUsd: z.coerce.number().positive(),
  weeklyHoursLimit: z.coerce.number().positive().optional(),
});

export const terminateAgentSchema = z.object({
  contractId: z.string().min(1),
  reason: z.string().optional(),
});

export const changeAgentRoleSchema = z.object({
  agentId: z.string().min(1),
  roleId: z.string().min(1),
});

export const updateAgentConfigSchema = z.object({
  agentId: z.string().min(1),
  enabled: z.boolean().optional(),
  maxConcurrentSteps: z.coerce.number().int().positive().optional(),
  systemPrompt: z.string().optional(),
  modelId: z.string().optional(),
});
