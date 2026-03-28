/**
 * MCP Server Configs Store — CRUD operations for mcp_server_configs table (Issue #263)
 *
 * Manages MCP server connection configurations.
 * Transport types: 'stdio' | 'http_streamable'
 */

import { eq, and, desc, like } from 'drizzle-orm';
import { getDatabase } from '../../database';
import { mcpServerConfigs, type McpServerConfig, type NewMcpServerConfig } from '../../database/schema';

const db = getDatabase();

export type TransportType = 'stdio' | 'http_streamable';

export interface CreateMcpServerConfigParams {
  name: string;
  transportType: TransportType;
  command?: string | null;
  url?: string | null;
  envVars?: Record<string, string> | null;
  headers?: Record<string, string> | null;
  createdBy?: string | null;
}

export interface UpdateMcpServerConfigParams {
  serverId: string;
  name?: string;
  transportType?: TransportType;
  command?: string | null;
  url?: string | null;
  envVars?: Record<string, string> | null;
  headers?: Record<string, string> | null;
  isActive?: boolean;
}

// Create a new MCP server config
export async function createMcpServerConfig(params: CreateMcpServerConfigParams): Promise<McpServerConfig> {
  const now = new Date().toISOString();
  const id = `mcp_server_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const newConfig: NewMcpServerConfig = {
    id,
    name: params.name,
    transportType: params.transportType,
    command: params.command ?? null,
    url: params.url ?? null,
    envVars: params.envVars ? JSON.stringify(params.envVars) : null,
    headers: params.headers ? JSON.stringify(params.headers) : null,
    isActive: 1,
    createdBy: params.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(mcpServerConfigs).values(newConfig);
  return newConfig as McpServerConfig;
}

// Get a single MCP server config by ID
export async function getMcpServerConfig(serverId: string): Promise<McpServerConfig | undefined> {
  const result = await db
    .select()
    .from(mcpServerConfigs)
    .where(eq(mcpServerConfigs.id, serverId))
    .limit(1);
  return result[0];
}

// List all MCP server configs with pagination
export async function listMcpServerConfigs(
  options: { limit?: number; offset?: number; activeOnly?: boolean } = {}
): Promise<{ servers: McpServerConfig[]; total: number }> {
  const { limit = 50, offset = 0, activeOnly = false } = options;

  const conditions = activeOnly ? [eq(mcpServerConfigs.isActive, 1)] : [];

  const servers = await db
    .select()
    .from(mcpServerConfigs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(mcpServerConfigs.createdAt))
    .limit(limit)
    .offset(offset);

  const totalResult = await db
    .select({ count: mcpServerConfigs.id })
    .from(mcpServerConfigs)
    .where(conditions.length > 0 ? and(...conditions) : undefined);

  return {
    servers,
    total: totalResult.length,
  };
}

// Search MCP server configs by name
export async function searchMcpServerConfigs(
  query: string,
  options: { limit?: number; offset?: number } = {}
): Promise<McpServerConfig[]> {
  const { limit = 50, offset = 0 } = options;

  return db
    .select()
    .from(mcpServerConfigs)
    .where(
      and(
        like(mcpServerConfigs.name, `%${query}%`),
        eq(mcpServerConfigs.isActive, 1)
      )
    )
    .orderBy(desc(mcpServerConfigs.createdAt))
    .limit(limit)
    .offset(offset);
}

// Update an MCP server config
export async function updateMcpServerConfig(params: UpdateMcpServerConfigParams): Promise<McpServerConfig | undefined> {
  const now = new Date().toISOString();

  const updateData: Partial<NewMcpServerConfig> = {
    updatedAt: now,
  };

  if (params.name !== undefined) updateData.name = params.name;
  if (params.transportType !== undefined) updateData.transportType = params.transportType;
  if (params.command !== undefined) updateData.command = params.command;
  if (params.url !== undefined) updateData.url = params.url;
  if (params.envVars !== undefined) updateData.envVars = params.envVars ? JSON.stringify(params.envVars) : null;
  if (params.headers !== undefined) updateData.headers = params.headers ? JSON.stringify(params.headers) : null;
  if (params.isActive !== undefined) updateData.isActive = params.isActive ? 1 : 0;

  await db
    .update(mcpServerConfigs)
    .set(updateData)
    .where(eq(mcpServerConfigs.id, params.serverId));

  return getMcpServerConfig(params.serverId);
}

// Soft delete (deactivate) an MCP server config
export async function deleteMcpServerConfig(serverId: string): Promise<boolean> {
  const now = new Date().toISOString();
  const result = await db
    .update(mcpServerConfigs)
    .set({ isActive: 0, updatedAt: now })
    .where(eq(mcpServerConfigs.id, serverId));

  return true;
}
