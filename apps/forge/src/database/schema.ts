/**
 * Schema Drizzle ORM para libsql
 *
 * APLICAÇÃO (ad-product-forge):
 * - agents: Configuração de agentes
 * - agent_providers: Associação agente-provedor com credenciais
 *
 * IMPORTANTE:
 * - conversations e messages são do módulo de comunicação no mastra-engine
 * - Cada agente tem seu próprio banco de dados (path relativo a workspace)
 * - Este schema é APENAS para a aplicação central
 */

import { integer, real, sqliteTable, text, uniqueIndex, index } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { z } from 'zod';

const _WorkspaceFilesystemConfigSchema = z.object({
  basePath: z.string(),
});

const _WorkspaceSandboxConfigSchema = z.object({
  workingDirectory: z.string(),
});

export type WorkspaceFilesystemConfig = z.infer<typeof _WorkspaceFilesystemConfigSchema>;
export type WorkspaceSandboxConfig = z.infer<typeof _WorkspaceSandboxConfigSchema>;

/**
 * Tabela: agents
 * Configuração base de agentes
 */
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  functionId: text('function_id')
    .references(() => agentFunctions.id, { onDelete: 'set null' }),
  modelProfileId: text('model_profile_id')
    .notNull()
    .references(() => llmProfiles.id, { onDelete: 'restrict' }),
  omModelProfileId: text('om_model_profile_id')
    .notNull()
    .references(() => llmProfiles.id, { onDelete: 'restrict' }),
  instructions: text('instructions').notNull(),
  executionState: text('execution_state').notNull().default('idle'),
  // Workspace configuration
  workspaceAutoSync: integer('workspace_auto_sync').notNull().default(1), // boolean as 0/1
  workspaceBm25: integer('workspace_bm25').notNull().default(1), // boolean as 0/1
  workspaceEmbedder: text('workspace_embedder').notNull().default('fastembed'),
  workspaceFilesystem: text('workspace_filesystem', { mode: 'json' }).$type<WorkspaceFilesystemConfig>(),
  workspaceSandbox: text('workspace_sandbox', { mode: 'json' }).$type<WorkspaceSandboxConfig>(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

export const agentFunctions = sqliteTable('agent_functions', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  agentFunctionsNameIdx: uniqueIndex('agent_functions_name_idx').on(table.name),
}));

export type AgentFunction = typeof agentFunctions.$inferSelect;
export type NewAgentFunction = typeof agentFunctions.$inferInsert;

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

export const functionRoles = sqliteTable('function_roles', {
  functionId: text('function_id')
    .notNull()
    .references(() => agentFunctions.id, { onDelete: 'cascade' }),
  roleId: text('role_id')
    .notNull()
    .references(() => agentRoles.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  functionRolesUniqueIdx: uniqueIndex('function_roles_unique_idx').on(table.functionId, table.roleId),
  functionRolesFunctionIdIdx: index('function_roles_function_id_idx').on(table.functionId),
  functionRolesRoleIdIdx: index('function_roles_role_id_idx').on(table.roleId),
}));

export type FunctionRole = typeof functionRoles.$inferSelect;
export type NewFunctionRole = typeof functionRoles.$inferInsert;

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
  isActive: integer('is_active').notNull().default(1),
  lastTriggeredAt: integer('last_triggered_at'),
  nextTriggerAt: integer('next_trigger_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => ({
  agentSchedulesAgentIdIdx: index('agent_schedules_agent_id_idx').on(table.agentId),
  agentSchedulesIsActiveIdx: index('agent_schedules_is_active_idx').on(table.isActive),
  agentSchedulesNextTriggerAtIdx: index('agent_schedules_next_trigger_at_idx').on(table.nextTriggerAt),
}));

export type AgentSchedule = typeof agentSchedules.$inferSelect;
export type NewAgentSchedule = typeof agentSchedules.$inferInsert;

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
  applicationsBaseDomain: z.string().min(1).optional(),
});

const _GitHubSystemIntegrationConfigSchema = z.object({
  organization: z.string().min(1),
  appHomeUrl: z.string().url(),
});

export type MigaduSystemIntegrationConfig = z.infer<typeof _MigaduSystemIntegrationConfigSchema>;
export type CoolifySystemIntegrationConfig = z.infer<typeof _CoolifySystemIntegrationConfigSchema>;
export type GitHubSystemIntegrationConfig = z.infer<typeof _GitHubSystemIntegrationConfigSchema>;
export type SystemIntegrationConfigMap = {
  migadu: MigaduSystemIntegrationConfig;
  coolify: CoolifySystemIntegrationConfig;
  github: GitHubSystemIntegrationConfig;
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
  function: one(agentFunctions, {
    fields: [agents.functionId],
    references: [agentFunctions.id],
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
}));

export const llmProfilesRelations = relations(llmProfiles, ({ many }) => ({
  agentsAsPrimaryModel: many(agents, {
    relationName: 'agent_model_profile',
  }),
  agentsAsOmModel: many(agents, {
    relationName: 'agent_om_model_profile',
  }),
}));

export const agentFunctionsRelations = relations(agentFunctions, ({ many }) => ({
  roleLinks: many(functionRoles),
  agents: many(agents),
}));

export const agentRolesRelations = relations(agentRoles, ({ many }) => ({
  functionLinks: many(functionRoles),
  toolPermissions: many(roleToolPermissions),
  workflowPermissions: many(roleWorkflowPermissions),
}));

export const functionRolesRelations = relations(functionRoles, ({ one }) => ({
  function: one(agentFunctions, {
    fields: [functionRoles.functionId],
    references: [agentFunctions.id],
  }),
  role: one(agentRoles, {
    fields: [functionRoles.roleId],
    references: [agentRoles.id],
  }),
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
