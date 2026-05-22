import {
  integer,
  sqliteTable,
  text,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';
import { relations } from 'drizzle-orm';
import { InferModel } from 'drizzle-orm';
import { agents } from './schema-agents.js';

export const mcpServerConfigs = sqliteTable(
  'mcp_server_configs',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description'),
    transport: text('transport').notNull(),
    command: text('command'),
    args: text('args'),
    envVars: text('env_vars'),
    url: text('url'),
    headers: text('headers'),
    version: integer('version').notNull().default(1),
    isActive: integer('is_active').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    nameIdx: index('idx_mcp_server_configs_name').on(table.name),
    isActiveIdx: index('idx_mcp_server_configs_is_active').on(table.isActive),
  }),
);

export type McpServerConfig = InferModel<typeof mcpServerConfigs>;
export type NewMcpServerConfig = InferModel<typeof mcpServerConfigs, 'insert'>;

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
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    agentIdIdx: index('idx_agent_mcp_configs_agent_id').on(table.agentId),
    serverIdIdx: index('idx_agent_mcp_configs_server_id').on(table.serverId),
    isActiveIdx: index('idx_agent_mcp_configs_is_active').on(table.isActive),
    uniqueAgentServer: uniqueIndex('unique_agent_server').on(table.agentId, table.serverId),
  }),
);

export type AgentMcpConfig = InferModel<typeof agentMcpConfigs>;
export type NewAgentMcpConfig = InferModel<typeof agentMcpConfigs, 'insert'>;