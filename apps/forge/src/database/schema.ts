/**
 * Schema Drizzle ORM para libsql
 *
 * APLICAÇÃO (ad-product-forge):
 * - agents: Configuração de agentes
 * - agent_providers: Associação agente-provedor com credenciais
 *
 * IMPORTANTE:
 * - internal-chat é persistido no banco central da aplicação
 * - os demais providers continuam no módulo de comunicação do mastra-engine por enquanto
 * - Cada agente tem seu próprio banco de dados (path relativo a workspace)
 */

import { integer, real, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';
import type { WorkspaceEmbedderId } from '@mastra-engine/core';

const _WorkspaceFilesystemConfigSchema = z.object({
  basePath: z.string(),
});

const _WorkspaceSandboxConfigSchema = z.object({
  workingDirectory: z.string(),
});

const _WorkspaceSkillsConfigSchema = z.array(z.string());

export type WorkspaceFilesystemConfig = z.infer<typeof _WorkspaceFilesystemConfigSchema>;
export type WorkspaceSandboxConfig = z.infer<typeof _WorkspaceSandboxConfigSchema>;
export type WorkspaceSkillsConfig = z.infer<typeof _WorkspaceSkillsConfigSchema>;

/**
 * Tabela: agents
 * Configuração base de agentes
 */
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  roleId: text('role_id')
    .references(() => agentRoles.id, { onDelete: 'set null' }),
  modelProfileId: text('model_profile_id')
    .notNull()
    .references(() => llmProfiles.id, { onDelete: 'restrict' }),
  omModelProfileId: text('om_model_profile_id')
    .notNull()
    .references(() => llmProfiles.id, { onDelete: 'restrict' }),
  instructions: text('instructions').notNull(),
  executionState: text('execution_state').notNull().default('idle'),
  lastExecutionError: text('last_execution_error'),
  lastExecutionErrorAt: integer('last_execution_error_at'),
  // Workspace configuration
  workspaceAutoSync: integer('workspace_auto_sync').notNull().default(1), // boolean as 0/1
  workspaceBm25: integer('workspace_bm25').notNull().default(1), // boolean as 0/1
  workspaceEmbedder: text('workspace_embedder').$type<WorkspaceEmbedderId>().notNull().default('transformers-multilingual-e5-small-cpu'),
  workspaceFilesystem: text('workspace_filesystem', { mode: 'json' }).$type<WorkspaceFilesystemConfig>(),
  workspaceSandbox: text('workspace_sandbox', { mode: 'json' }).$type<WorkspaceSandboxConfig>(),
  workspaceSkills: text('workspace_skills', { mode: 'json' }).$type<WorkspaceSkillsConfig>(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export const agentRoles = sqliteTable('agent_roles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  agentRolesNameIdx: uniqueIndex('agent_roles_name_idx').on(table.name),
}));

export type AgentRole = typeof agentRoles.$inferSelect;
export type NewAgentRole = typeof agentRoles.$inferInsert;

export const roleToolPermissions = sqliteTable('role_tool_permissions', {
  roleId: text('role_id')
    .notNull()
    .references(() => agentRoles.id, { onDelete: 'cascade' }),
  toolId: text('tool_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  roleToolPermissionsUniqueIdx: uniqueIndex('role_tool_permissions_unique_idx').on(table.roleId, table.toolId),
  roleToolPermissionsRoleIdIdx: index('role_tool_permissions_role_id_idx').on(table.roleId),
}));

export type RoleToolPermission = typeof roleToolPermissions.$inferSelect;
export type NewRoleToolPermission = typeof roleToolPermissions.$inferInsert;

export const roleWorkflowPermissions = sqliteTable('role_workflow_permissions', {
  roleId: text('role_id')
    .notNull()
    .references(() => agentRoles.id, { onDelete: 'cascade' }),
  workflowId: text('workflow_id').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  roleWorkflowPermissionsUniqueIdx: uniqueIndex('role_workflow_permissions_unique_idx').on(table.roleId, table.workflowId),
  roleWorkflowPermissionsRoleIdIdx: index('role_workflow_permissions_role_id_idx').on(table.roleId),
}));

export type RoleWorkflowPermission = typeof roleWorkflowPermissions.$inferSelect;
export type NewRoleWorkflowPermission = typeof roleWorkflowPermissions.$inferInsert;

export const systemSettings = sqliteTable('system_settings', {
  id: text('id').primaryKey(),
  companyName: text('company_name').notNull(),
  companyContext: text('company_context').notNull(),
  stepDelayEnabled: integer('step_delay_enabled').notNull().default(1),
  communicationDmFlushingEnabled: integer('communication_dm_flushing_enabled').notNull().default(1),
  communicationGroupFlushingEnabled: integer('communication_group_flushing_enabled').notNull().default(1),
  memoryLastMessagesFullEnabled: integer('memory_last_messages_full_enabled').notNull().default(0),
  memoryLastMessagesCount: integer('memory_last_messages_count').notNull().default(20),
  tokenCountFilterEnabled: integer('token_count_filter_enabled').notNull().default(1),
  tokenCountFilterLimit: integer('token_count_filter_limit').notNull().default(100000),
  checkpointedOmEnabled: integer('checkpointed_om_enabled').notNull().default(0),
  checkpointedOmTotalContextTokens: integer('checkpointed_om_total_context_tokens').notNull().default(50000),
  checkpointedOmRecentRawTokens: integer('checkpointed_om_recent_raw_tokens').notNull().default(10000),
  checkpointedOmRawObservationBatchTokens: integer('checkpointed_om_raw_observation_batch_tokens').notNull().default(5000),
  checkpointedOmObservationReflectionBatchTokens: integer('checkpointed_om_observation_reflection_batch_tokens').notNull().default(5000),
  checkpointedOmObservationSupportTokens: integer('checkpointed_om_observation_support_tokens').notNull().default(2000),
  checkpointedOmReflectionSupportTokens: integer('checkpointed_om_reflection_support_tokens').notNull().default(2000),
  omObservationMessageTokens: integer('om_observation_message_tokens').notNull().default(15000),
  omObservationBufferTokens: real('om_observation_buffer_tokens').notNull().default(0.2),
  omObservationBufferActivation: real('om_observation_buffer_activation').notNull().default(0.8),
  omObservationPreviousObserverTokens: integer('om_observation_previous_observer_tokens').notNull().default(1000),
  omReflectionObservationTokens: integer('om_reflection_observation_tokens').notNull().default(20000),
  omReflectionBufferActivation: real('om_reflection_buffer_activation').notNull().default(0.5),
  ltmRecallSearchMode: text('ltm_recall_search_mode').notNull().default('hybrid'),
  ltmRecallWorkspaceTopK: integer('ltm_recall_workspace_top_k').notNull().default(3),
  ltmRecallGraphTopK: integer('ltm_recall_graph_top_k').notNull().default(3),
  ltmRecallGraphThreshold: real('ltm_recall_graph_threshold').notNull().default(0.7),
  ltmRecallGraphRandomWalkSteps: integer('ltm_recall_graph_random_walk_steps').notNull().default(50),
  ltmRecallGraphIncludeSources: integer('ltm_recall_graph_include_sources').notNull().default(1),
  ltmRecallScoreThreshold: real('ltm_recall_score_threshold').notNull().default(0.7),
  ltmRecallDocumentCount: integer('ltm_recall_document_count').notNull().default(3),
  updatedAt: integer('updated_at').notNull(),
});

export type SystemSettings = typeof systemSettings.$inferSelect;
export type NewSystemSettings = typeof systemSettings.$inferInsert;

export const agentExecutionContracts = sqliteTable('agent_execution_contracts', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  budgetUsd: real('budget_usd').notNull(),
  autoRenew: integer('auto_renew').notNull().default(1),
  fundedAt: integer('funded_at'),
  startsAt: integer('starts_at').notNull(),
  endsAt: integer('ends_at').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  agentContractsAgentIdIdx: index('agent_execution_contracts_agent_id_idx').on(table.agentId),
  agentContractsEndsAtIdx: index('agent_execution_contracts_ends_at_idx').on(table.endsAt),
}));

export type AgentExecutionContract = typeof agentExecutionContracts.$inferSelect;
export type NewAgentExecutionContract = typeof agentExecutionContracts.$inferInsert;

export const agentExecutionSteps = sqliteTable('agent_execution_steps', {
  id: text('id').primaryKey(),
  contractId: text('contract_id')
    .notNull()
    .references(() => agentExecutionContracts.id, { onDelete: 'cascade' }),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  llmProfileId: text('llm_profile_id')
    .notNull()
    .references(() => llmProfiles.id, { onDelete: 'restrict' }),
  modelKey: text('model_key').notNull(),
  kind: text('kind').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull(),
  inputPerMillionUsd: real('input_per_million_usd').notNull().default(0),
  inputCachePerMillionUsd: real('input_cache_per_million_usd').notNull().default(0),
  outputPerMillionUsd: real('output_per_million_usd').notNull().default(0),
  contractCostMultiplier: real('contract_cost_multiplier').notNull().default(1),
  costUsd: real('cost_usd').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  agentExecutionStepsAgentIdIdx: index('agent_execution_steps_agent_id_idx').on(table.agentId),
  agentExecutionStepsContractIdIdx: index('agent_execution_steps_contract_id_idx').on(table.contractId),
  agentExecutionStepsLlmProfileIdIdx: index('agent_execution_steps_llm_profile_id_idx').on(table.llmProfileId),
  agentExecutionStepsCreatedAtIdx: index('agent_execution_steps_created_at_idx').on(table.createdAt),
}));

export type AgentExecutionStep = typeof agentExecutionSteps.$inferSelect;
export type NewAgentExecutionStep = typeof agentExecutionSteps.$inferInsert;

export const agentNotifications = sqliteTable('agent_notifications', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  createdAt: integer('created_at').notNull(),
  readAt: integer('read_at'),
}, (table) => ({
  agentNotificationsAgentIdIdx: index('agent_notifications_agent_id_idx').on(table.agentId),
  agentNotificationsCreatedAtIdx: index('agent_notifications_created_at_idx').on(table.createdAt),
  agentNotificationsReadAtIdx: index('agent_notifications_read_at_idx').on(table.readAt),
}));

export type AgentNotification = typeof agentNotifications.$inferSelect;
export type NewAgentNotification = typeof agentNotifications.$inferInsert;

export const agentSchedules = sqliteTable('agent_schedules', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull().default('agent'),
  name: text('name').notNull(),
  description: text('description'),
  scheduleType: text('schedule_type').notNull(),
  cronExpression: text('cron_expression'),
  scheduledDate: integer('scheduled_date'),
  timezone: text('timezone').notNull(),
  content: text('content').notNull(),
  wakeWhenRunning: integer('wake_when_running').notNull().default(1),
  isActive: integer('is_active').notNull().default(1),
  lastTriggeredAt: integer('last_triggered_at'),
  nextTriggerAt: integer('next_trigger_at'),
  // Cross-agent scheduling: creatorId = agent that created the schedule
  // null = self-created (agent created for itself)
  creatorId: text('creator_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  agentSchedulesAgentIdIdx: index('agent_schedules_agent_id_idx').on(table.agentId),
  agentSchedulesIsActiveIdx: index('agent_schedules_is_active_idx').on(table.isActive),
  agentSchedulesNextTriggerAtIdx: index('agent_schedules_next_trigger_at_idx').on(table.nextTriggerAt),
  agentSchedulesCreatorIdIdx: index('idx_schedules_creator_id').on(table.creatorId),
}));

export type AgentSchedule = typeof agentSchedules.$inferSelect;
export type NewAgentSchedule = typeof agentSchedules.$inferInsert;

export const internalChatAccounts = sqliteTable('forge_internal_chat_accounts', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .references(() => agents.id, { onDelete: 'cascade' }),
  slug: text('slug').notNull(),
  displayName: text('display_name').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  internalChatAccountsSlugIdx: uniqueIndex('forge_internal_chat_accounts_slug_idx').on(table.slug),
  internalChatAccountsAgentIdIdx: uniqueIndex('forge_internal_chat_accounts_agent_id_idx').on(table.agentId),
}));

export type InternalChatAccount = typeof internalChatAccounts.$inferSelect;
export type NewInternalChatAccount = typeof internalChatAccounts.$inferInsert;

export const internalChatConversations = sqliteTable('forge_internal_chat_conversations', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  name: text('name'),
  createdByAccountId: text('created_by_account_id')
    .references(() => internalChatAccounts.id, { onDelete: 'set null' }),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  internalChatConversationsTypeIdx: index('forge_internal_chat_conversations_type_idx').on(table.type),
  internalChatConversationsUpdatedAtIdx: index('forge_internal_chat_conversations_updated_at_idx').on(table.updatedAt),
}));

export type InternalChatConversation = typeof internalChatConversations.$inferSelect;
export type NewInternalChatConversation = typeof internalChatConversations.$inferInsert;

export const internalChatConversationMembers = sqliteTable('forge_internal_chat_conversation_members', {
  conversationId: text('conversation_id')
    .notNull()
    .references(() => internalChatConversations.id, { onDelete: 'cascade' }),
  accountId: text('account_id')
    .notNull()
    .references(() => internalChatAccounts.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('normal'),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  internalChatConversationMembersUniqueIdx: uniqueIndex('forge_internal_chat_conversation_members_unique_idx').on(table.conversationId, table.accountId),
  internalChatConversationMembersAccountIdx: index('forge_internal_chat_conversation_members_account_idx').on(table.accountId),
}));

export type InternalChatConversationMember = typeof internalChatConversationMembers.$inferSelect;
export type NewInternalChatConversationMember = typeof internalChatConversationMembers.$inferInsert;

export const internalChatMessages = sqliteTable('forge_internal_chat_messages', {
  id: text('id').primaryKey(),
  conversationId: text('conversation_id')
    .notNull()
    .references(() => internalChatConversations.id, { onDelete: 'cascade' }),
  authorAccountId: text('author_account_id')
    .notNull()
    .references(() => internalChatAccounts.id, { onDelete: 'cascade' }),
  content: text('content').notNull(),
  replyToMessageId: text('reply_to_message_id'),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  internalChatMessagesConversationIdx: index('forge_internal_chat_messages_conversation_idx').on(table.conversationId),
  internalChatMessagesCreatedAtIdx: index('forge_internal_chat_messages_created_at_idx').on(table.createdAt),
}));

export type InternalChatMessage = typeof internalChatMessages.$inferSelect;
export type NewInternalChatMessage = typeof internalChatMessages.$inferInsert;

export const internalChatMessageReads = sqliteTable('forge_internal_chat_message_reads', {
  messageId: text('message_id')
    .notNull()
    .references(() => internalChatMessages.id, { onDelete: 'cascade' }),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  readAt: integer('read_at'),
}, (table) => ({
  internalChatMessageReadsUniqueIdx: uniqueIndex('forge_internal_chat_message_reads_unique_idx').on(table.messageId, table.agentId),
  internalChatMessageReadsAgentIdx: index('forge_internal_chat_message_reads_agent_idx').on(table.agentId),
  internalChatMessageReadsReadAtIdx: index('forge_internal_chat_message_reads_read_at_idx').on(table.readAt),
}));

export type InternalChatMessageRead = typeof internalChatMessageReads.$inferSelect;
export type NewInternalChatMessageRead = typeof internalChatMessageReads.$inferInsert;

export const llmModelPrices = sqliteTable('llm_model_prices', {
  modelKey: text('model_key').primaryKey(),
  inputPerMillionUsd: real('input_per_million_usd').notNull(),
  inputCachePerMillionUsd: real('input_cache_per_million_usd').notNull(),
  outputPerMillionUsd: real('output_per_million_usd').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type LlmModelPrice = typeof llmModelPrices.$inferSelect;
export type NewLlmModelPrice = typeof llmModelPrices.$inferInsert;

export const companyCashLedger = sqliteTable('company_cash_ledger', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  direction: text('direction').notNull(),
  amountUsd: real('amount_usd').notNull(),
  description: text('description'),
  referenceType: text('reference_type'),
  referenceId: text('reference_id'),
  status: text('status').notNull(),
  dueAt: integer('due_at'),
  effectiveAt: integer('effective_at'),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  companyCashLedgerStatusIdx: index('company_cash_ledger_status_idx').on(table.status),
  companyCashLedgerEffectiveAtIdx: index('company_cash_ledger_effective_at_idx').on(table.effectiveAt),
}));

export type CompanyCashLedgerEntry = typeof companyCashLedger.$inferSelect;

export const companyRecurringPayables = sqliteTable('company_recurring_payables', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  amountUsd: real('amount_usd').notNull(),
  recurrencePeriod: text('recurrence_period').notNull(),
  nextDueAt: integer('next_due_at').notNull(),
  isActive: integer('is_active').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  companyRecurringPayablesIsActiveIdx: index('company_recurring_payables_is_active_idx').on(table.isActive),
  companyRecurringPayablesNextDueAtIdx: index('company_recurring_payables_next_due_at_idx').on(table.nextDueAt),
}));

export type CompanyRecurringPayable = typeof companyRecurringPayables.$inferSelect;
export type NewCompanyRecurringPayable = typeof companyRecurringPayables.$inferInsert;

const _MigaduSystemIntegrationConfigSchema = z.object({
  apiUser: z.string().email(),
  apiKey: z.string().min(1),
});

const _CoolifySystemIntegrationConfigSchema = z.object({
  baseUrl: z.string().url(),
  adminToken: z.string().min(1),
  serverId: z.string().min(1),
  destinationId: z.string().min(1),
  applicationsBaseDomain: z.string().min(1).optional(),
});

const _GitHubSystemIntegrationConfigSchema = z.object({
  organization: z.string().min(1),
  appHomeUrl: z.string().url(),
});

const _MinimaxSystemIntegrationConfigSchema = z.object({
  apiKey: z.string().min(1),
});

export type MigaduSystemIntegrationConfig = z.infer<typeof _MigaduSystemIntegrationConfigSchema>;
export type CoolifySystemIntegrationConfig = z.infer<typeof _CoolifySystemIntegrationConfigSchema>;
export type GitHubSystemIntegrationConfig = z.infer<typeof _GitHubSystemIntegrationConfigSchema>;
export type MinimaxSystemIntegrationConfig = z.infer<typeof _MinimaxSystemIntegrationConfigSchema>;
export type SystemIntegrationConfigMap = {
  migadu: MigaduSystemIntegrationConfig;
  coolify: CoolifySystemIntegrationConfig;
  github: GitHubSystemIntegrationConfig;
  minimax: MinimaxSystemIntegrationConfig;
};

export const systemIntegrations = sqliteTable('system_integrations', {
  providerType: text('provider_type').primaryKey().$type<keyof SystemIntegrationConfigMap>(),
  encryptedConfig: text('encrypted_config').notNull(),
  isEnabled: integer('is_enabled').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type SystemIntegration = typeof systemIntegrations.$inferSelect;
export type NewSystemIntegration = typeof systemIntegrations.$inferInsert;
export type NewCompanyCashLedgerEntry = typeof companyCashLedger.$inferInsert;

export const llmProfiles = sqliteTable('llm_profiles', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  modelKey: text('model_key').notNull(),
  baseUrl: text('base_url'),
  encryptedApiKey: text('encrypted_api_key').notNull(),
  contractCostMultiplier: real('contract_cost_multiplier').notNull().default(1),
  isEnabled: integer('is_enabled').notNull().default(1),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  llmProfilesNameIdx: uniqueIndex('llm_profiles_name_idx').on(table.name),
  llmProfilesModelKeyIdx: index('llm_profiles_model_key_idx').on(table.modelKey),
  llmProfilesIsEnabledIdx: index('llm_profiles_is_enabled_idx').on(table.isEnabled),
}));

export type LlmProfile = typeof llmProfiles.$inferSelect;
export type NewLlmProfile = typeof llmProfiles.$inferInsert;

export const systemLlmDefaults = sqliteTable('system_llm_defaults', {
  id: text('id').primaryKey(),
  primaryProfileId: text('primary_profile_id').notNull(),
  omProfileId: text('om_profile_id').notNull(),
  hiringRhProfileId: text('hiring_rh_profile_id').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type SystemLlmDefaults = typeof systemLlmDefaults.$inferSelect;
export type NewSystemLlmDefaults = typeof systemLlmDefaults.$inferInsert;

/**
 * Tabela: agent_providers
 * Credenciais criptografadas de provedores por agente
 */
export const agentProviders = sqliteTable('agent_providers', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  providerType: text('provider_type').notNull(),
  encryptedCredentials: text('encrypted_credentials').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  agentProviderUnique: uniqueIndex('agent_provider_unique').on(table.agentId, table.providerType),
}));

export type AgentProvider = typeof agentProviders.$inferSelect;
export type NewAgentProvider = typeof agentProviders.$inferInsert;

/**
 * Relações
 */
export const agentsRelations = relations(agents, ({ one, many }) => ({
  role: one(agentRoles, {
    fields: [agents.roleId],
    references: [agentRoles.id],
  }),
  modelProfile: one(llmProfiles, {
    relationName: 'agent_model_profile',
    fields: [agents.modelProfileId],
    references: [llmProfiles.id],
  }),
  omModelProfile: one(llmProfiles, {
    relationName: 'agent_om_model_profile',
    fields: [agents.omModelProfileId],
    references: [llmProfiles.id],
  }),
  providers: many(agentProviders),
  executionContracts: many(agentExecutionContracts),
  executionSteps: many(agentExecutionSteps),
  notifications: many(agentNotifications),
  schedules: many(agentSchedules),
  internalChatAccount: one(internalChatAccounts, {
    fields: [agents.id],
    references: [internalChatAccounts.agentId],
  }),
  internalChatMemberships: many(internalChatConversationMembers),
  internalChatMessages: many(internalChatMessages),
}));

export const llmProfilesRelations = relations(llmProfiles, ({ many }) => ({
  agentsAsPrimaryModel: many(agents, {
    relationName: 'agent_model_profile',
  }),
  agentsAsOmModel: many(agents, {
    relationName: 'agent_om_model_profile',
  }),
}));

export const agentRolesRelations = relations(agentRoles, ({ many }) => ({
  agents: many(agents),
  toolPermissions: many(roleToolPermissions),
  workflowPermissions: many(roleWorkflowPermissions),
}));

export const roleToolPermissionsRelations = relations(roleToolPermissions, ({ one }) => ({
  role: one(agentRoles, {
    fields: [roleToolPermissions.roleId],
    references: [agentRoles.id],
  }),
}));

export const roleWorkflowPermissionsRelations = relations(roleWorkflowPermissions, ({ one }) => ({
  role: one(agentRoles, {
    fields: [roleWorkflowPermissions.roleId],
    references: [agentRoles.id],
  }),
}));

export const agentProvidersRelations = relations(agentProviders, ({ one }) => ({
  agent: one(agents, {
    fields: [agentProviders.agentId],
    references: [agents.id],
  }),
}));

export const agentExecutionContractsRelations = relations(agentExecutionContracts, ({ one, many }) => ({
  agent: one(agents, {
    fields: [agentExecutionContracts.agentId],
    references: [agents.id],
  }),
  steps: many(agentExecutionSteps),
}));

export const agentExecutionStepsRelations = relations(agentExecutionSteps, ({ one }) => ({
  agent: one(agents, {
    fields: [agentExecutionSteps.agentId],
    references: [agents.id],
  }),
  contract: one(agentExecutionContracts, {
    fields: [agentExecutionSteps.contractId],
    references: [agentExecutionContracts.id],
  }),
}));

export const agentNotificationsRelations = relations(agentNotifications, ({ one }) => ({
  agent: one(agents, {
    fields: [agentNotifications.agentId],
    references: [agents.id],
  }),
}));

export const agentSchedulesRelations = relations(agentSchedules, ({ one }) => ({
  agent: one(agents, {
    fields: [agentSchedules.agentId],
    references: [agents.id],
  }),
}));

export const internalChatAccountsRelations = relations(internalChatAccounts, ({ one }) => ({
  agent: one(agents, {
    fields: [internalChatAccounts.agentId],
    references: [agents.id],
  }),
}));

export const internalChatConversationsRelations = relations(internalChatConversations, ({ one, many }) => ({
  creator: one(internalChatAccounts, {
    fields: [internalChatConversations.createdByAccountId],
    references: [internalChatAccounts.id],
  }),
  members: many(internalChatConversationMembers),
  messages: many(internalChatMessages),
}));

export const internalChatConversationMembersRelations = relations(internalChatConversationMembers, ({ one }) => ({
  conversation: one(internalChatConversations, {
    fields: [internalChatConversationMembers.conversationId],
    references: [internalChatConversations.id],
  }),
  account: one(internalChatAccounts, {
    fields: [internalChatConversationMembers.accountId],
    references: [internalChatAccounts.id],
  }),
}));

export const internalChatMessagesRelations = relations(internalChatMessages, ({ one, many }) => ({
  conversation: one(internalChatConversations, {
    fields: [internalChatMessages.conversationId],
    references: [internalChatConversations.id],
  }),
  author: one(internalChatAccounts, {
    fields: [internalChatMessages.authorAccountId],
    references: [internalChatAccounts.id],
  }),
  reads: many(internalChatMessageReads),
}));

export const internalChatMessageReadsRelations = relations(internalChatMessageReads, ({ one }) => ({
  message: one(internalChatMessages, {
    fields: [internalChatMessageReads.messageId],
    references: [internalChatMessages.id],
  }),
  agent: one(agents, {
    fields: [internalChatMessageReads.agentId],
    references: [agents.id],
  }),
}));

/**
 * MCP Server Configs - Configuration for MCP servers that agents can connect to
 */
export const mcpServerConfigs = sqliteTable(
  'mcp_server_configs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    transport: text('transport').notNull(), // 'stdio' | 'http_streamable'
    command: text('command'), // For stdio transport
    args: text('args'), // JSON array for stdio args
    envVars: text('env_vars'), // JSON object for env vars
    url: text('url'), // For http_streamable transport
    headers: text('headers'), // JSON object for HTTP headers
    version: integer('version').notNull().default(1),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    nameIdx: index('idx_mcp_server_configs_name').on(table.name),
    isActiveIdx: index('idx_mcp_server_configs_is_active').on(table.isActive),
  }),
);

export type McpServerConfig = typeof mcpServerConfigs.$inferSelect;
export type NewMcpServerConfig = typeof mcpServerConfigs.$inferInsert;

/**
 * Agent MCP Configs - Association table linking agents to MCP servers
 */
export const agentMcpConfigs = sqliteTable(
  'agent_mcp_configs',
  {
    id: text('id').primaryKey(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    serverId: text('server_id')
      .notNull()
      .references(() => mcpServerConfigs.id, { onDelete: 'cascade' }),
    isActive: integer('is_active').notNull().default(1),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => ({
    agentIdIdx: index('idx_agent_mcp_configs_agent_id').on(table.agentId),
    serverIdIdx: index('idx_agent_mcp_configs_server_id').on(table.serverId),
    isActiveIdx: index('idx_agent_mcp_configs_is_active').on(table.isActive),
    uniqueAgentServer: uniqueIndex('unique_agent_server').on(table.agentId, table.serverId),
  }),
);

export type AgentMcpConfig = typeof agentMcpConfigs.$inferSelect;
export type NewAgentMcpConfig = typeof agentMcpConfigs.$inferInsert;

// Relations
export const mcpServerConfigsRelations = relations(mcpServerConfigs, ({ many }) => ({
  agentConfigs: many(agentMcpConfigs),
}));

export const agentMcpConfigsRelations = relations(agentMcpConfigs, ({ one }) => ({
  agent: one(agents, {
    fields: [agentMcpConfigs.agentId],
    references: [agents.id],
  }),
  server: one(mcpServerConfigs, {
    fields: [agentMcpConfigs.serverId],
    references: [mcpServerConfigs.id],
  }),
}));
