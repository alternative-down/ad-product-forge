/**
 * Drizzle relations for schema-mcp tables.
 *
 * Extracted from schema.ts in #5337 to colocate table definitions with their relations.
 */
import { relations } from 'drizzle-orm';

import {
  agents
} from './schema-agents.js';

import {
  agentMcpConfigs,
  mcpServerConfigs
} from './schema-mcp.js';

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

