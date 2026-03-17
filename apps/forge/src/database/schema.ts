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

import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import type { WorkspaceFilesystemConfig, WorkspaceSandboxConfig } from '../agents/workspace-config.js';

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
  tools: text('tools'), // JSON array de tool IDs ou configuração
  workflows: text('workflows'), // JSON array de workflow IDs
  // Workspace configuration
  workspaceAutoSync: integer('workspace_auto_sync').notNull().default(1), // boolean as 0/1
  workspaceBm25: integer('workspace_bm25').notNull().default(1), // boolean as 0/1
  workspaceEmbedder: text('workspace_embedder').notNull().default('fastembed'),
  workspaceFilesystem: text('workspace_filesystem'), // JSON config
  workspaceSandbox: text('workspace_sandbox'), // JSON config
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;

/**
 * Agent configuration after parsing workspace configs from JSON strings
 */
export type ParsedAgentConfig = Omit<Agent, 'workspaceFilesystem' | 'workspaceSandbox'> & {
  workspaceFilesystem: WorkspaceFilesystemConfig | undefined;
  workspaceSandbox: WorkspaceSandboxConfig | undefined;
};

/**
 * Parse agent workspace configuration from raw database values
 */
export function parseAgentWorkspaceConfig(
  agent: Agent,
  parseFS: (json: string | null | undefined) => WorkspaceFilesystemConfig | undefined,
  parseSandbox: (json: string | null | undefined) => WorkspaceSandboxConfig | undefined,
): ParsedAgentConfig {
  return {
    ...agent,
    workspaceFilesystem: parseFS(agent.workspaceFilesystem),
    workspaceSandbox: parseSandbox(agent.workspaceSandbox),
  };
}

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
});

export type AgentProvider = typeof agentProviders.$inferSelect;
export type NewAgentProvider = typeof agentProviders.$inferInsert;

/**
 * Relações
 */
export const agentsRelations = relations(agents, ({ many }) => ({
  providers: many(agentProviders),
}));

export const agentProvidersRelations = relations(agentProviders, ({ one }) => ({
  agent: one(agents, {
    fields: [agentProviders.agentId],
    references: [agents.id],
  }),
}));
