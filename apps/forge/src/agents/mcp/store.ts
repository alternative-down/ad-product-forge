/**
 * MCP Store - Database operations for MCP server configs and agent MCP configs
 */

import { eq, and, like, or } from 'drizzle-orm';
import { getDatabase } from '../../database/client';
import { mcpServerConfigs, agentMcpConfigs, type NewMcpServerConfig, type NewAgentMcpConfig } from '../../database/schema';
export type { McpServerConfig, AgentMcpConfig } from '../../database/schema';
import { createId } from '../../utils/id';

// MCP Server Config operations
export async function createMcpServerConfig(data: Omit<NewMcpServerConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<McpServerConfig> {
  const db = getDatabase();
  const now = Date.now();
  
  const newConfig: NewMcpServerConfig = {
    id: createId(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  
  await db.insert(mcpServerConfigs).values(newConfig);
  return newConfig as McpServerConfig;
}

export async function getMcpServerConfig(id: string): Promise<McpServerConfig | undefined> {
  const db = getDatabase();
  let results;
  results = await db
    .select()
    .from(mcpServerConfigs)
    .where(eq(mcpServerConfigs.id, id));
  return results[0];
}

export async function listMcpServerConfigs(options?: { isActive?: boolean }): Promise<McpServerConfig[]> {
  const db = getDatabase();
  
  if (options?.isActive !== undefined) {
    return await db
      .select()
      .from(mcpServerConfigs)
      .where(eq(mcpServerConfigs.isActive, options.isActive ? 1 : 0));
  }
  
  return await db.select().from(mcpServerConfigs);
}

export async function updateMcpServerConfig(id: string, data: Partial<Omit<NewMcpServerConfig, 'id' | 'createdAt'>>): Promise<McpServerConfig | undefined> {
  const db = getDatabase();
  
  await db
    .update(mcpServerConfigs)
    .set({ ...data, updatedAt: Date.now() })
    .where(eq(mcpServerConfigs.id, id));
  
  return await getMcpServerConfig(id);
}

export async function deleteMcpServerConfig(id: string): Promise<void> {
  const db = getDatabase();
  await db.delete(mcpServerConfigs).where(eq(mcpServerConfigs.id, id));
}

export async function searchMcpServerConfigs(query: string): Promise<McpServerConfig[]> {
  const db = getDatabase();
  const searchPattern = `%${query}%`;
  
  return await db
    .select()
    .from(mcpServerConfigs)
    .where(
      or(
        like(mcpServerConfigs.name, searchPattern),
        like(mcpServerConfigs.description, searchPattern)
      )
    );
}

// Agent MCP Config operations
export async function createAgentMcpConfig(data: Omit<NewAgentMcpConfig, 'id' | 'createdAt' | 'updatedAt'>): Promise<AgentMcpConfig> {
  const db = getDatabase();
  const now = Date.now();
  
  const newConfig: NewAgentMcpConfig = {
    id: createId(),
    ...data,
    createdAt: now,
    updatedAt: now,
  };
  
  await db.insert(agentMcpConfigs).values(newConfig);
  return newConfig as AgentMcpConfig;
}

export async function getAgentMcpConfig(id: string): Promise<AgentMcpConfig | undefined> {
  const db = getDatabase();
  let results;
  results = await db
    .select()
    .from(agentMcpConfigs)
    .where(eq(agentMcpConfigs.id, id));
  return results[0];
}

export async function listAgentMcpConfigs(agentId: string, options?: { isActive?: boolean }): Promise<AgentMcpConfig[]> {
  const db = getDatabase();
  const conditions = [eq(agentMcpConfigs.agentId, agentId)];
  
  if (options?.isActive !== undefined) {
    conditions.push(eq(agentMcpConfigs.isActive, options.isActive ? 1 : 0));
  }
  
  return await db
    .select()
    .from(agentMcpConfigs)
    .where(and(...conditions));
}

export async function updateAgentMcpConfig(id: string, data: Partial<Omit<NewAgentMcpConfig, 'id' | 'createdAt'>>): Promise<AgentMcpConfig | undefined> {
  const db = getDatabase();
  
  await db
    .update(agentMcpConfigs)
    .set({ ...data, updatedAt: Date.now() })
    .where(eq(agentMcpConfigs.id, id));
  
  return await getAgentMcpConfig(id);
}

export async function deleteAgentMcpConfig(id: string): Promise<void> {
  const db = getDatabase();
  await db.delete(agentMcpConfigs).where(eq(agentMcpConfigs.id, id));
}

export async function getAgentMcpServers(agentId: string): Promise<{ config: AgentMcpConfig; server: McpServerConfig }[]> {
  const db = getDatabase();

  const results = await db
    .select({
      config: agentMcpConfigs,
      server: mcpServerConfigs,
    })
    .from(agentMcpConfigs)
    .innerJoin(mcpServerConfigs, eq(agentMcpConfigs.serverId, mcpServerConfigs.id))
    .where(and(
      eq(agentMcpConfigs.agentId, agentId),
      eq(agentMcpConfigs.isActive, 1),
      eq(mcpServerConfigs.isActive, 1)
    ));

  return results;
}
