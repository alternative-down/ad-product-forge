import { z } from 'zod';

// =============================================================================
// AGENT SCHEMAS
// =============================================================================

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

export const roleToolPermissionSchema = z.object({
  roleId: z.string().min(1),
  toolId: z.string().min(1),
});

export const roleWorkflowPermissionSchema = z.object({
  roleId: z.string().min(1),
  workflowId: z.string().min(1),
});

export const roleCapabilitySchema = z.object({
  roleId: z.string().min(1),
  capabilityId: z.string().min(1),
});

export const createRoleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
});

export const updateRoleSchema = z.object({
  roleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
});

export const deleteRoleSchema = z.object({
  roleId: z.string().min(1),
});

// =============================================================================
// SCHEDULE SCHEMAS
// =============================================================================

export const createScheduleSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  scheduleType: z.enum(['cron', 'date']),
  cronExpression: z.string().min(1).optional(),
  scheduledDate: z.string().min(1).optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
  wakeWhenRunning: z.boolean().optional(),
});

export const updateScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  scheduleType: z.enum(['cron', 'date']).optional(),
  cronExpression: z.string().min(1).optional().nullable(),
  scheduledDate: z.string().min(1).optional().nullable(),
  timezone: z.string().min(1).optional(),
  content: z.string().optional(),
  wakeWhenRunning: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const deleteScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
});

// =============================================================================
// INTERNAL CHAT SCHEMAS
// =============================================================================

export const adminInternalChatSendSchema = z.object({
  agentId: z.string().min(1),
  targetKey: z.string().min(1),
  provider: z.string().min(1),
  content: z.string().min(1),
});

export const createExternalInternalChatAccountSchema = z.object({
  provider: z.string().min(1),
  targetKey: z.string().min(1),
  name: z.string().min(1).optional(),
});

export const updateExternalInternalChatAccountSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).optional(),
  webhookUrl: z.string().url().optional().nullable(),
});

export const deleteExternalInternalChatAccountSchema = z.object({
  accountId: z.string().min(1),
});

export const internalChatAccountIdQuerySchema = z.object({
  accountId: z.string().min(1),
});

export const internalChatMessagesQuerySchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const internalChatMessageAttachmentQuerySchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
  attachmentName: z.string().min(1),
});

export const createInternalChatConversationSchema = z.object({
  accountId: z.string().min(1),
  name: z.string().min(1).optional(),
  memberKeys: z.array(z.string()).min(1),
});

export const sendInternalChatConversationMessageSchema = z.object({
  conversationId: z.string().min(1),
  content: z.string().min(1),
  parentMessageId: z.string().min(1).optional(),
});

export const updateInternalChatConversationSchema = z.object({
  conversationId: z.string().min(1),
  name: z.string().min(1).optional(),
  archive: z.boolean().optional(),
});

export const archiveInternalChatConversationSchema = z.object({
  conversationId: z.string().min(1),
});

export const internalChatGroupMembersQuerySchema = z.object({
  conversationId: z.string().min(1),
});

export const addInternalChatGroupMemberSchema = z.object({
  conversationId: z.string().min(1),
  participantKey: z.string().min(1),
  role: z.enum(['admin', 'normal']).default('normal'),
});

export const updateInternalChatGroupMemberRoleSchema = z.object({
  conversationId: z.string().min(1),
  participantKey: z.string().min(1),
  role: z.enum(['admin', 'normal']),
});

export const removeInternalChatGroupMemberSchema = z.object({
  conversationId: z.string().min(1),
  participantKey: z.string().min(1),
});

// =============================================================================
// AGENT CONTRACT SCHEMAS
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

export const upsertAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
  credentials: z.record(z.unknown()),
});

export const deleteAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
});

// =============================================================================
// MCP SERVER SCHEMAS
// =============================================================================

const mcpServerFieldsSchema = z.discriminatedUnion('transport', [
  z.object({
    transport: z.literal('stdio'),
    command: z.string().trim().min(1),
    argsText: z.string().optional().default(''),
    envVarsText: z.string().optional().default(''),
    url: z.string().optional().default(''),
    headersText: z.string().optional().default(''),
  }),
  z.object({
    transport: z.literal('http_streamable'),
    url: z.string().trim().url(),
    headersText: z.string().optional().default(''),
    command: z.string().optional().default(''),
    argsText: z.string().optional().default(''),
    envVarsText: z.string().optional().default(''),
  }),
]);

export const createAgentMcpServerSchema = z
  .object({
    agentId: z.string().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(''),
    isActive: z.boolean().default(true),
  })
  .and(mcpServerFieldsSchema);

export const updateAgentMcpServerSchema = z
  .object({
    agentId: z.string().min(1),
    configId: z.string().min(1),
    serverId: z.string().min(1),
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(''),
    isActive: z.boolean().default(true),
  })
  .and(mcpServerFieldsSchema);

export const deleteAgentMcpServerSchema = z.object({
  agentId: z.string().min(1),
  configId: z.string().min(1),
  serverId: z.string().min(1),
});

export const upsertSystemMcpServerSchema = z
  .object({
    serverId: z.string().min(1).optional(),
    name: z.string().trim().min(1),
    description: z.string().trim().optional().default(''),
    isActive: z.boolean().default(true),
  })
  .and(mcpServerFieldsSchema);

export const deleteSystemMcpServerSchema = z.object({
  serverId: z.string().min(1),
});

export const assignAgentMcpServerSchema = z.object({
  agentId: z.string().min(1),
  serverId: z.string().min(1),
  isActive: z.boolean().default(true),
});

export const setAgentMcpServerActiveSchema = z.object({
  agentId: z.string().min(1),
  configId: z.string().min(1),
  isActive: z.boolean(),
});

export const detachAgentMcpServerSchema = z.object({
  agentId: z.string().min(1),
  configId: z.string().min(1),
});

// =============================================================================
// AGENT SKILLS SCHEMAS
// =============================================================================

export const uploadAgentSkillsSchema = z.object({
  agentId: z.string().min(1),
  archiveBase64: z.string().min(1),
});

export const deleteAgentSkillSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

export const uploadSystemSkillsSchema = z.object({
  archiveBase64: z.string().min(1),
});

export const deleteSystemSkillSchema = z.object({
  skillName: z.string().min(1),
});

export const installGlobalSkillForAgentSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

export const publishAgentSkillToGlobalSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

// =============================================================================
// SYSTEM INTEGRATION SCHEMAS
// =============================================================================

export const systemIntegrationProviderSchema = z.enum(['migadu', 'coolify', 'github', 'minimax']);

export const upsertSystemIntegrationSchema = z.discriminatedUnion('providerType', [
  z.object({
    providerType: z.literal('migadu'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      apiUser: z.string().email(),
      apiKey: z.string().min(1),
    }),
  }),
  z.object({
    providerType: z.literal('coolify'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      baseUrl: z.string().url(),
      adminToken: z.string().min(1),
      serverId: z.string().min(1),
      destinationId: z.string().min(1),
      applicationsBaseDomain: z.string().min(1).optional(),
    }),
  }),
  z.object({
    providerType: z.literal('github'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      organization: z.string().min(1),
      appHomeUrl: z.string().url(),
    }),
  }),
  z.object({
    providerType: z.literal('minimax'),
    isEnabled: z.boolean().default(true),
    config: z.object({
      apiKey: z.string().min(1),
    }),
  }),
]);

export const deleteSystemIntegrationSchema = z.object({
  providerType: systemIntegrationProviderSchema,
});

// =============================================================================
// LLM SCHEMAS
// =============================================================================

export const upsertLlmProfileSchema = z.object({
  profileId: z.string().min(1).optional(),
  name: z.string().min(1),
  modelId: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  systemPrompt: z.string().optional(),
});

export const deleteLlmProfileSchema = z.object({
  profileId: z.string().min(1),
});

export const updateLlmDefaultsSchema = z.object({
  defaultModelId: z.string().min(1).optional(),
  defaultTemperature: z.number().min(0).max(2).optional(),
  defaultMaxTokens: z.number().int().positive().optional(),
});

export const upsertLlmModelPriceSchema = z.object({
  modelId: z.string().min(1),
  inputPricePer1M: z.number().positive(),
  outputPricePer1M: z.number().positive(),
  cacheReadPricePer1M: z.number().positive().optional(),
  cacheWritePricePer1M: z.number().positive().optional(),
});

// =============================================================================
// SYSTEM SETTINGS SCHEMAS
// =============================================================================

export const upsertSystemSettingsSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1),
  description: z.string().optional(),
});

// =============================================================================
// OAUTH SCHEMAS
// =============================================================================

export const oauthSyncProviderSchema = z.enum(['openai-codex', 'anthropic', 'all']);

export const syncOauthSchema = z.object({
  provider: oauthSyncProviderSchema,
});

// =============================================================================
// FINANCE SCHEMAS
// =============================================================================

export const createInvestmentSchema = z.object({
  amount: z.number().positive(),
  description: z.string().min(1),
});

export const createPayableSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('agent_contract'),
    agentId: z.string().min(1),
    amount: z.number().positive(),
    description: z.string().optional(),
  }),
  z.object({
    kind: z.literal('system_expense'),
    description: z.string().min(1),
    amount: z.number().positive(),
    category: z.string().min(1),
  }),
]);

export const ledgerEntryActionSchema = z.object({
  entryId: z.string().min(1),
  action: z.enum(['approve', 'cancel']),
});

export const recurringPayableStatusSchema = z.object({
  payableId: z.string().min(1),
  isActive: z.boolean(),
});
