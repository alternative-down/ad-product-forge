/**
 * MCP Store - Database operations for MCP server configs and agent MCP configs
 */

import { eq, and, like, or } from 'drizzle-orm';
import { getDatabase } from '../../database/client';
import { mcpServerConfigs, agentMcpConfigs, type McpServerConfig, type NewMcpServerConfig, type AgentMcpConfig, type NewAgentMcpConfig } from '../../database/schema';
import { createId } from '../../utils/id';
import { forgeDebug } from '@forge-runtime/core';

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
  
  try {
    await db.insert(mcpServerConfigs).values(newConfig);
  } catch (err) {
    forgeDebug({ scope: 'mcp-store', level: 'error', message: 'createMcpServerConfig failed', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
  return newConfig as McpServerConfig;
}

export async function getMcpServerConfig(id: string): Promise<McpServerConfig | undefined> {
  const db = getDatabase();
  let results;
  try {
    results = await db
      .select()
      .from(mcpServerConfigs)
      .where(eq(mcpServerConfigs.id, id));
  } catch (err) {
    forgeDebug({ scope: 'mcp-store', level: 'error', message: 'getMcpServerConfig failed', context: { id, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
  return results[0];
}

export async function listMcpServerConfigs(options?: { isActive?: boolean }): Promise<McpServerConfig[]> {
  const db = getDatabase();
  
  try {
    if (options?.isActive !== undefined) {
      return await db
        .select()
        .from(mcpServerConfigs)
        .where(eq(mcpServerConfigs.isActive, options.isActive ? 1 : 0));
    }
    
    return await db.select().from(mcpServerConfigs);
  } catch (err) {
    forgeDebug({ scope: 'mcp-store', level: 'error', message: 'listMcpServerConfigs failed', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}

export async function updateMcpServerConfig(id: string, data: Partial<Omit<NewMcpServerConfig, 'id' | 'createdAt'>>): Promise<McpServerConfig | undefined> {
  const db = getDatabase();
  
  try {
    await db
      .update(mcpServerConfigs)
      .set({ ...data, updatedAt: Date.now() })
      .where(eq(mcpServerConfigs.id, id));
  } catch (err) {
    forgeDebug({ scope: 'mcp-store', level: 'error', message: 'updateMcpServerConfig failed', context: { id, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
  
  return getMcpServerConfig(id);
}

export async function deleteMcpServerConfig(id: string): Promise<void> {
  const db = getDatabase();
  try {
    await db.delete(mcpServerConfigs).where(eq(mcpServerConfigs.id, id));
  } catch (err) {
    forgeDebug({ scope: 'mcp-store', level: 'error', message: 'deleteMcpServerConfig failed', context: { id, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}

export async function searchMcpServerConfigs(query: string): Promise<McpServerConfig[]> {
  const db = getDatabase();
  const searchPattern = `%${query}%`;
  
  try {
    return await db
      .select()
      .from(mcpServerConfigs)
      .where(
        or(
          like(mcpServerConfigs.name, searchPattern),
          like(mcpServerConfigs.description, searchPattern)
        )
      );
  } catch (err) {
    forgeDebug({ scope: 'mcp-store', level: 'error', message: 'searchMcpServerConfigs failed', context: { query, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
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
  
  try {
    await db.insert(agentMcpConfigs).values(newConfig);
  } catch (err) {
    forgeDebug({ scope: 'mcp-store', level: 'error', message: 'createAgentMcpConfig failed', context: { error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
  return newConfig as AgentMcpConfig;
}

export async function getAgentMcpConfig(id: string): Promise<AgentMcpConfig | undefined> {
  const db = getDatabase();
  let results;
  try {
    results = await db
      .select()
      .from(agentMcpConfigs)
      .where(eq(agentMcpConfigs.id, id));
  } catch (err) {
    forgeDebug({ scope: 'mcp-store', level: 'error', message: 'getAgentMcpConfig failed', context: { id, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
  return results[0];
}

export async function listAgentMcpConfigs(agentId: string, options?: { isActive?: boolean }): Promise<AgentMcpConfig[]> {
  const db = getDatabase();
  const conditions = [eq(agentMcpConfigs.agentId, agentId)];
  
  if (options?.isActive !== undefined) {
    conditions.push(eq(agentMcpConfigs.isActive, options.isActive ? 1 : 0));
  }
  
  try {
    return await db
      .select()
      .from(agentMcpConfigs)
      .where(and(...conditions));
  } catch (err) {
    forgeDebug({ scope: 'mcp-store', level: 'error', message: 'listAgentMcpConfigs failed', context: { agentId, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}

export async function updateAgentMcpConfig(id: string, data: Partial<Omit<NewAgentMcpConfig, 'id' | 'createdAt'>>): Promise<AgentMcpConfig | undefined> {
  const db = getDatabase();
  
  try {
    await db
      .update(agentMcpConfigs)
      .set({ ...data, updatedAt: Date.now() })
      .where(eq(agentMcpConfigs.id, id));
  } catch (err) {
    forgeDebug({ scope: 'mcp-store', level: 'error', message: 'updateAgentMcpConfig failed', context: { id, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
  
  return getAgentMcpConfig(id);
}

export async function deleteAgentMcpConfig(id: string): Promise<void> {
  const db = getDatabase();
  try {
    await db.delete(agentMcpConfigs).where(eq(agentMcpConfigs.id, id));
  } catch (err) {
    forgeDebug({ scope: 'mcp-store', level: 'error', message: 'deleteAgentMcpConfig failed', context: { id, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}

export async function getAgentMcpServers(agentId: string): Promise<{ config: AgentMcpConfig; server: McpServerConfig }[]> {
  const db = getDatabase();

  try {
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
  } catch (err) {
    forgeDebug({
      scope: 'mcp-store',
      level: 'error',
      runtimeId: agentId,
      message: 'getAgentMcpServers failed: ' + (err instanceof Error ? err.message : String(err)),
    });
    throw err;
  }
}
