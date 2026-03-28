import { eq, and, isNull, like, sql, desc, asc } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { getDatabase } from '../../database';
import { agentMcpTools, type AgentMcpTool, type NewAgentMcpTool } from '../../database/schema';

const db = getDatabase();

// =============================================================================
// Types
// =============================================================================

export interface CreateMcpToolParams {
  agentId?: string | null;
  name: string;
  description?: string | null;
  command: string;
  args: string[]; // Array of arguments
  env?: Record<string, string>; // Environment variables
  transport?: 'stdio' | 'sse' | 'http';
  version?: number;
  createdBy?: string | null;
}

export interface UpdateMcpToolParams {
  toolId: string;
  name?: string;
  description?: string | null;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'sse' | 'http';
  version?: number;
  isActive?: number;
}

export interface ListMcpToolsParams {
  limit?: number;
  offset?: number;
  sortBy?: 'created_at' | 'name' | 'updated_at';
  sortOrder?: 'asc' | 'desc';
}

export interface SearchMcpToolsParams {
  query: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create a new MCP tool configuration
 */
export async function createMcpTool(params: CreateMcpToolParams): Promise<AgentMcpTool> {
  const now = Date.now();
  const id = nanoid();
  
  const newTool: NewAgentMcpTool = {
    id,
    agentId: params.agentId ?? null,
    name: params.name,
    description: params.description ?? null,
    command: params.command,
    args: JSON.stringify(params.args),
    env: params.env ? JSON.stringify(params.env) : null,
    transport: params.transport ?? 'stdio',
    version: params.version ?? 1,
    isActive: 1,
    createdBy: params.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(agentMcpTools).values(newTool);
  return newTool as AgentMcpTool;
}

/**
 * Get a single MCP tool by ID
 */
export async function getMcpTool(toolId: string): Promise<AgentMcpTool | undefined> {
  const [tool] = await db
    .select()
    .from(agentMcpTools)
    .where(eq(agentMcpTools.id, toolId));
  
  return tool;
}

/**
 * List all MCP tools with pagination
 */
export async function listMcpTools(params: ListMcpToolsParams = {}): Promise<{ tools: AgentMcpTool[]; total: number }> {
  const { limit = 50, offset = 0, sortBy = 'created_at', sortOrder = 'desc' } = params;
  
  const sortColumn = sortBy === 'name' 
    ? agentMcpTools.name 
    : sortBy === 'updated_at' 
      ? agentMcpTools.updatedAt 
      : agentMcpTools.createdAt;
  
  const orderFn = sortOrder === 'asc' ? asc : desc;
  
  const [tools, [{ count }]] = await Promise.all([
    db
      .select()
      .from(agentMcpTools)
      .orderBy(orderFn(sortColumn))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(agentMcpTools),
  ]);
  
  return { tools, total: Number(count) };
}

/**
 * Search MCP tools by name
 */
export async function searchMcpTools(params: SearchMcpToolsParams): Promise<{ tools: AgentMcpTool[]; total: number }> {
  const { query, limit = 50, offset = 0 } = params;
  const searchPattern = `%${query}%`;
  
  const [tools, [{ count }]] = await Promise.all([
    db
      .select()
      .from(agentMcpTools)
      .where(like(agentMcpTools.name, searchPattern))
      .orderBy(desc(agentMcpTools.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(agentMcpTools)
      .where(like(agentMcpTools.name, searchPattern)),
  ]);
  
  return { tools, total: Number(count) };
}

/**
 * Get MCP tools for a specific agent (including global tools)
 */
export async function getAgentMcpTools(
  agentId: string,
  options: { activeOnly?: boolean; limit?: number; offset?: number } = {}
): Promise<{ tools: AgentMcpTool[]; total: number }> {
  const { activeOnly = true, limit = 50, offset = 0 } = options;
  
  const conditions = [
    eq(agentMcpTools.agentId, agentId),
  ];
  
  // Include global tools (agentId = null)
  // We'll get global tools separately and merge
  
  let globalTools: AgentMcpTool[] = [];
  
  if (activeOnly) {
    conditions.push(eq(agentMcpTools.isActive, 1));
    
    // Get global active tools
    const [{ count: globalCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentMcpTools)
      .where(and(isNull(agentMcpTools.agentId), eq(agentMcpTools.isActive, 1)));
    
    globalTools = await db
      .select()
      .from(agentMcpTools)
      .where(and(isNull(agentMcpTools.agentId), eq(agentMcpTools.isActive, 1)))
      .limit(limit)
      .offset(offset);
    
    // Get agent-specific tools
    const [{ count: agentCount }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(agentMcpTools)
      .where(and(eq(agentMcpTools.agentId, agentId), eq(agentMcpTools.isActive, 1)));
    
    const agentTools = await db
      .select()
      .from(agentMcpTools)
      .where(and(eq(agentMcpTools.agentId, agentId), eq(agentMcpTools.isActive, 1)))
      .limit(limit)
      .offset(offset);
    
    return { tools: [...globalTools, ...agentTools], total: Number(globalCount) + Number(agentCount) };
  }
  
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentMcpTools)
    .where(and(eq(agentMcpTools.agentId, agentId), eq(agentMcpTools.isActive, 1)));
  
  const agentTools = await db
    .select()
    .from(agentMcpTools)
    .where(and(eq(agentMcpTools.agentId, agentId), eq(agentMcpTools.isActive, 1)))
    .limit(limit)
    .offset(offset);
  
  return { tools: [...globalTools, ...agentTools], total: Number(count) };
}

/**
 * Get global MCP tools (not bound to any agent)
 */
export async function getGlobalMcpTools(
  options: { activeOnly?: boolean; limit?: number; offset?: number } = {}
): Promise<{ tools: AgentMcpTool[]; total: number }> {
  const { activeOnly = true, limit = 50, offset = 0 } = options;
  
  let conditions = [isNull(agentMcpTools.agentId)];
  
  if (activeOnly) {
    conditions.push(eq(agentMcpTools.isActive, 1));
  }
  
  const whereClause = and(...conditions);
  
  const [tools, [{ count }]] = await Promise.all([
    db
      .select()
      .from(agentMcpTools)
      .where(whereClause)
      .orderBy(desc(agentMcpTools.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(agentMcpTools)
      .where(whereClause),
  ]);
  
  return { tools, total: Number(count) };
}

/**
 * Update an MCP tool
 */
export async function updateMcpTool(params: UpdateMcpToolParams): Promise<AgentMcpTool | undefined> {
  const { toolId, ...updates } = params;
  
  const updateData: Partial<NewAgentMcpTool> = {
    updatedAt: Date.now(),
  };
  
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.description !== undefined) updateData.description = updates.description;
  if (updates.command !== undefined) updateData.command = updates.command;
  if (updates.args !== undefined) updateData.args = JSON.stringify(updates.args);
  if (updates.env !== undefined) updateData.env = updates.env ? JSON.stringify(updates.env) : null;
  if (updates.transport !== undefined) updateData.transport = updates.transport;
  if (updates.version !== undefined) updateData.version = updates.version;
  if (updates.isActive !== undefined) updateData.isActive = updates.isActive;
  
  await db
    .update(agentMcpTools)
    .set(updateData)
    .where(eq(agentMcpTools.id, toolId));
  
  return getMcpTool(toolId);
}

/**
 * Soft delete an MCP tool (set isActive = 0)
 */
export async function deleteMcpTool(toolId: string): Promise<boolean> {
  const result = await db
    .update(agentMcpTools)
    .set({ isActive: 0, updatedAt: Date.now() })
    .where(eq(agentMcpTools.id, toolId));
  
  return true;
}

/**
 * Hard delete an MCP tool
 */
export async function hardDeleteMcpTool(toolId: string): Promise<boolean> {
  await db.delete(agentMcpTools).where(eq(agentMcpTools.id, toolId));
  return true;
}
