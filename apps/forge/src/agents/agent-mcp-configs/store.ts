/**
 * Agent MCP Configs Store — CRUD operations for agent_mcp_configs table (Issue #263)
 *
 * Manages the relationship between agents and MCP servers.
 */

import { eq, and, desc } from 'drizzle-orm';
import { getDatabase } from '../../database';
import { agentMcpConfigs, mcpServerConfigs, type AgentMcpConfig, type NewAgentMcpConfig, type McpServerConfig } from '../../database/schema';

const db = getDatabase();

export interface CreateAgentMcpConfigParams {
  agentId: string;
  serverId: string;
}

export interface UpdateAgentMcpConfigParams {
  configId: string;
  isActive?: boolean;
}

// Create a new agent-MCP server relationship
export async function createAgentMcpConfig(params: CreateAgentMcpConfigParams): Promise<AgentMcpConfig> {
  const now = new Date().toISOString();
  const id = `agent_mcp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const newConfig: NewAgentMcpConfig = {
    id,
    agentId: params.agentId,
    serverId: params.serverId,
    isActive: 1,
    createdAt: now,
  };

  await db.insert(agentMcpConfigs).values(newConfig);
  return newConfig as AgentMcpConfig;
}

// Get a single agent-MCP config by ID
export async function getAgentMcpConfig(configId: string): Promise<AgentMcpConfig | undefined> {
  const result = await db
    .select()
    .from(agentMcpConfigs)
    .where(eq(agentMcpConfigs.id, configId))
    .limit(1);
  return result[0];
}

// Get MCP servers configured for an agent
export async function getAgentMcpServers(
  agentId: string,
  options: { activeOnly?: boolean } = {}
): Promise<(AgentMcpConfig & { server: McpServerConfig })[]> {
  const { activeOnly = true } = options;

  const conditions = [eq(agentMcpConfigs.agentId, agentId)];
  if (activeOnly) {
    conditions.push(eq(agentMcpConfigs.isActive, 1));
  }

  const results = await db
    .select()
    .from(agentMcpConfigs)
    .where(and(...conditions))
    .orderBy(desc(agentMcpConfigs.createdAt));

  // Fetch server details for each config
  const withServers: (AgentMcpConfig & { server: McpServerConfig })[] = [];
  
  for (const config of results) {
    const servers = await db
      .select()
      .from(mcpServerConfigs)
      .where(
        and(
          eq(mcpServerConfigs.id, config.serverId),
          eq(mcpServerConfigs.isActive, 1)
        )
      )
      .limit(1);
    
    if (servers.length > 0) {
      withServers.push({ ...config, server: servers[0] });
    }
  }

  return withServers;
}

// List all agent-MCP configs
export async function listAgentMcpConfigs(
  options: { limit?: number; offset?: number; activeOnly?: boolean } = {}
): Promise<{ configs: AgentMcpConfig[]; total: number }> {
  const { limit = 50, offset = 0, activeOnly = false } = options;

  const conditions = activeOnly ? [eq(agentMcpConfigs.isActive, 1)] : [];

  const configs = await db
    .select()
    .from(agentMcpConfigs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(agentMcpConfigs.createdAt))
    .limit(limit)
    .offset(offset);

  const totalResult = await db
    .select({ count: agentMcpConfigs.id })
    .from(agentMcpConfigs)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return {
    configs,
    total: totalResult.length,
  };
}

// Update an agent-MCP config
export async function updateAgentMcpConfig(params: UpdateAgentMcpConfigParams): Promise<AgentMcpConfig | undefined> {
  const updateData: Partial<NewAgentMcpConfig> = {};

  if (params.isActive !== undefined) updateData.isActive = params.isActive ? 1 : 0;

  await db
    .update(agentMcpConfigs)
    .set(updateData)
    .where(eq(agentMcpConfigs.id, params.configId));

  return getAgentMcpConfig(params.configId);
}

// Delete an agent-MCP config (soft delete)
export async function deleteAgentMcpConfig(configId: string): Promise<boolean> {
  const result = await db
    .update(agentMcpConfigs)
    .set({ isActive: 0 })
    .where(eq(agentMcpConfigs.id, configId));

  return true;
}
