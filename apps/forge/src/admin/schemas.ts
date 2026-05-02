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

export const agentActionSchema = z.object({
  agentId: z.string().min(1),
});

export const clearAgentHistorySchema = z.object({
  agentId: z.string().min(1),
  includeLongTermMemoryThread: z.boolean().default(true),
});

export const agentLongTermMemoryRecallSearchSchema = z.object({
  agentId: z.string().min(1),
  query: z.string(),
});

export const adminInternalChatSendSchema = z.object({
  agentId: z.string().min(1),
  targetKey: z.string().min(1).optional(),
  senderSlug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  senderDisplayName: z.string().trim().min(1),
  content: z.string().trim().min(1),
});

export const createExternalInternalChatAccountSchema = z.object({
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().trim().min(1),
  description: z.string().trim().optional(),
});

export const updateExternalInternalChatAccountSchema = z.object({
  accountId: z.string().min(1),
  slug: z.string().trim().min(1).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  displayName: z.string().trim().min(1),
  description: z.string().trim().optional(),
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
  limit: z.coerce.number().int().min(1).max(100).default(50),
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
  type: z.enum(['dm', 'group']),
  name: z.string().trim().optional(),
  participantAccountIds: z.array(z.string().min(1)).min(1),
});

export const sendInternalChatConversationMessageSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  content: z.string().trim().default(''),
  attachments: z.array(z.object({
    name: z.string().min(1),
    contentType: z.string().optional(),
    dataBase64: z.string().min(1),
  })).default([]),
}).refine(
  (value) => value.content.length > 0 || value.attachments.length > 0,
  {
    message: 'Message content or attachments are required.',
  },
);

export const updateInternalChatConversationSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  name: z.string().trim().min(1),
});

export const archiveInternalChatConversationSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
});

export const internalChatGroupMembersQuerySchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
});

export const addInternalChatGroupMemberSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  participantAccountId: z.string().min(1),
  role: z.enum(['admin', 'normal']).default('normal'),
});

export const updateInternalChatGroupMemberRoleSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  participantAccountId: z.string().min(1),
  role: z.enum(['admin', 'normal']),
});

export const removeInternalChatGroupMemberSchema = z.object({
  accountId: z.string().min(1),
  conversationId: z.string().min(1),
  participantAccountId: z.string().min(1),
});

export const topUpAgentContractSchema = z.object({
  agentId: z.string().min(1),
  amountUsd: z.coerce.number().positive(),
});

export const adjustAgentContractBudgetSchema = z.object({
  agentId: z.string().min(1),
  newBudgetUsd: z.coerce.number().min(0),
});

export const renewAgentContractSchema = z.object({
  agentId: z.string().min(1),
  newBudgetUsd: z.coerce.number().min(0),
});

export const hireAgentSchema = z.object({
  hiringRequest: z.string().min(1),
  additionalContext: z.string().optional(),
  weeklyBudgetUsd: z.coerce.number().positive(),
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
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  instructions: z.string().min(1),
  workspaceAutoSync: z.boolean(),
  workspaceBm25: z.boolean(),
  modelProfileId: z.string().min(1),
  omModelProfileId: z.string().min(1),
});

export const upsertAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
  credentials: z.record(z.string(), z.string()).optional(),
});

export const deleteAgentProviderSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'email']),
});

export const mcpServerFieldsSchema = z.discriminatedUnion('transport', [
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

export const upsertLlmProfileSchema = z.object({
  profileId: z.string().min(1).optional(),
  name: z.string().min(1),
  modelKey: z.string().min(1),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().min(1),
  contractCostMultiplier: z.coerce.number().positive().default(1),
  isEnabled: z.boolean().default(true),
});

export const deleteLlmProfileSchema = z.object({
  profileId: z.string().min(1),
});

export const updateLlmDefaultsSchema = z.object({
  primaryProfileId: z.string().min(1),
  omProfileId: z.string().min(1),
  hiringRhProfileId: z.string().min(1),
});

export const upsertLlmModelPriceSchema = z.object({
  modelKey: z.string().min(1),
  inputPerMillionUsd: z.coerce.number().nonnegative(),
  inputCachePerMillionUsd: z.coerce.number().nonnegative(),
  outputPerMillionUsd: z.coerce.number().nonnegative(),
});

export const upsertSystemSettingsSchema = z.object({
  companyName: z.string(),
  companyContext: z.string(),
  stepDelayEnabled: z.boolean().default(true),
  communicationDmFlushingEnabled: z.boolean().default(true),
  communicationGroupFlushingEnabled: z.boolean().default(true),
  memoryLastMessagesFullEnabled: z.boolean().default(false),
  memoryLastMessagesCount: z.coerce.number().int().positive().default(20),
  tokenCountFilterEnabled: z.boolean().default(true),
  tokenCountFilterLimit: z.coerce.number().int().positive().default(100000),
  checkpointedOmEnabled: z.boolean().default(false),
  checkpointedOmTotalContextTokens: z.coerce.number().int().positive().default(50000),
  checkpointedOmRecentRawTokens: z.coerce.number().int().positive().default(10000),
  checkpointedOmRawObservationBatchTokens: z.coerce.number().int().positive().default(5000),
  checkpointedOmObservationReflectionBatchTokens: z.coerce.number().int().positive().default(5000),
  checkpointedOmObservationSupportTokens: z.coerce.number().int().nonnegative().default(2000),
  checkpointedOmReflectionSupportTokens: z.coerce.number().int().nonnegative().default(2000),
  ltmRecallSearchMode: z.enum(['hybrid', 'vector', 'bm25']).default('hybrid'),
  ltmRecallWorkspaceTopK: z.coerce.number().int().min(1).max(20).default(3),
  ltmRecallGraphTopK: z.coerce.number().int().min(1).max(20).default(3),
  ltmRecallGraphThreshold: z.coerce.number().min(0).max(1).default(0.7),
  ltmRecallGraphRandomWalkSteps: z.coerce.number().int().min(1).max(500).default(50),
  ltmRecallGraphIncludeSources: z.boolean().default(true),
  ltmRecallScoreThreshold: z.coerce.number().min(0).max(1).default(0.7),
  ltmRecallDocumentCount: z.coerce.number().int().min(1).max(20).default(3),
});

export const oauthSyncProviderSchema = z.enum(['openai-codex', 'anthropic', 'all']);

export const syncOauthSchema = z.object({
  providerId: oauthSyncProviderSchema.default('all'),
});

export const createInvestmentSchema = z.object({
  amountUsd: z.coerce.number().positive(),
  description: z.string().optional(),
  effectiveAt: z.string().optional(),
});

export const createPayableSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('single'),
    name: z.string().min(1),
    description: z.string().optional(),
    amountUsd: z.coerce.number().positive(),
    dueAt: z.string().min(1),
  }),
  z.object({
    kind: z.literal('recurring'),
    name: z.string().min(1),
    description: z.string().optional(),
    amountUsd: z.coerce.number().positive(),
    dueAt: z.string().min(1),
    recurrencePeriod: z.enum(['weekly', 'monthly', 'yearly']),
  }),
]);

export const ledgerEntryActionSchema = z.object({
  entryId: z.string().min(1),
  effectiveAt: z.string().optional(),
});

export const recurringPayableStatusSchema = z.object({
  payableId: z.string().min(1),
  isActive: z.boolean(),
});

