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

const WorkspaceFilesystemConfigSchema = z.object({
  basePath: z.string(),
});

const WorkspaceSandboxConfigSchema = z.object({
  workingDirectory: z.string(),
});

export type WorkspaceFilesystemConfig = z.infer<typeof WorkspaceFilesystemConfigSchema>;
export type WorkspaceSandboxConfig = z.infer<typeof WorkspaceSandboxConfigSchema>;

/**
 * Tabela: agents
 * Configuração base de agentes
 */
export const agents = sqliteTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  model: text('model').notNull(),
  omModel: text('om_model'), // Modelo para observational memory
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

export const agentExecutionContracts = sqliteTable('agent_execution_contracts', {
  id: text('id').primaryKey(),
  agentId: text('agent_id')
    .notNull()
    .references(() => agents.id, { onDelete: 'cascade' }),
  budgetUsd: real('budget_usd').notNull(),
  autoRenew: integer('auto_renew').notNull().default(1),
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
  modelKey: text('model_key').notNull(),
  kind: text('kind').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  cachedInputTokens: integer('cached_input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull(),
  costUsd: real('cost_usd').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => ({
  agentExecutionStepsAgentIdIdx: index('agent_execution_steps_agent_id_idx').on(table.agentId),
  agentExecutionStepsContractIdIdx: index('agent_execution_steps_contract_id_idx').on(table.contractId),
  agentExecutionStepsCreatedAtIdx: index('agent_execution_steps_created_at_idx').on(table.createdAt),
}));

export type AgentExecutionStep = typeof agentExecutionSteps.$inferSelect;
export type NewAgentExecutionStep = typeof agentExecutionSteps.$inferInsert;

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
export const agentsRelations = relations(agents, ({ many }) => ({
  providers: many(agentProviders),
  executionContracts: many(agentExecutionContracts),
  executionSteps: many(agentExecutionSteps),
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
