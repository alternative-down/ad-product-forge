/**
 * Agent Prompts Store — CRUD operations for agent_prompts table (Issue #265)
 *
 * Allows runtime editing of prompts that are injected into agent system context.
 * Supports versioning for tracking changes.
 */

import { eq, and, desc, isNull, like } from 'drizzle-orm';
import { getDatabase } from '../../database';
import { agentPrompts, type AgentPrompt, type NewAgentPrompt } from '../../database/schema';

const db = getDatabase();

export type PromptType = 'system' | 'user' | 'assistant' | 'custom';

export interface CreatePromptParams {
  agentId?: string | null;
  promptType: PromptType;
  name: string;
  description?: string | null;
  content: string;
  createdBy?: string | null;
}

export interface UpdatePromptParams {
  promptId: string;
  name?: string;
  description?: string | null;
  content?: string;
  isActive?: boolean;
  version?: number;
}

// Create a new prompt
export async function createPrompt(params: CreatePromptParams): Promise<AgentPrompt> {
  const now = Date.now();
  const id = `prompt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const newPrompt: NewAgentPrompt = {
    id,
    agentId: params.agentId ?? null,
    promptType: params.promptType,
    name: params.name,
    description: params.description ?? null,
    content: params.content,
    version: 1,
    isActive: 1,
    createdBy: params.createdBy ?? null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(agentPrompts).values(newPrompt);
  return newPrompt as AgentPrompt;
}

// Get a single prompt by ID
export async function getPrompt(promptId: string): Promise<AgentPrompt | undefined> {
  const result = await db
    .select()
    .from(agentPrompts)
    .where(eq(agentPrompts.id, promptId))
    .limit(1);

  return result[0];
}

// Get prompts for a specific agent
export async function getAgentPrompts(
  agentId: string,
  promptType?: PromptType,
  activeOnly = true
): Promise<AgentPrompt[]> {
  const conditions = [eq(agentPrompts.agentId, agentId)];

  if (promptType) {
    conditions.push(eq(agentPrompts.promptType, promptType));
  }

  if (activeOnly) {
    conditions.push(eq(agentPrompts.isActive, 1));
  }

  const results = await db
    .select()
    .from(agentPrompts)
    .where(and(...conditions))
    .orderBy(desc(agentPrompts.updatedAt));

  return results;
}

// Get global prompts (not bound to a specific agent)
export async function getGlobalPrompts(
  promptType?: PromptType,
  activeOnly = true
): Promise<AgentPrompt[]> {
  const conditions: ReturnType<typeof eq>[] = [];

  conditions.push(isNull(agentPrompts.agentId));

  if (promptType) {
    conditions.push(eq(agentPrompts.promptType, promptType));
  }

  if (activeOnly) {
    conditions.push(eq(agentPrompts.isActive, 1));
  }

  const results = await db
    .select()
    .from(agentPrompts)
    .where(and(...conditions))
    .orderBy(desc(agentPrompts.updatedAt));

  return results;
}

// Get all active system prompts for an agent (combines agent-specific + global)
export async function getActiveSystemPrompts(agentId: string): Promise<AgentPrompt[]> {
  // Get global prompts (system prompts that apply to all agents)
  const globalPrompts = await db
    .select()
    .from(agentPrompts)
    .where(and(
      isNull(agentPrompts.agentId),
      eq(agentPrompts.promptType, 'system'),
      eq(agentPrompts.isActive, 1)
    ));

  // Get agent-specific prompts
  const agentPromptsResult = await db
    .select()
    .from(agentPrompts)
    .where(and(
      eq(agentPrompts.agentId, agentId),
      eq(agentPrompts.isActive, 1)
    ));

  // Combine and dedupe by name (agent-specific takes precedence)
  const promptMap = new Map<string, AgentPrompt>();

  for (const prompt of globalPrompts) {
    promptMap.set(prompt.name, prompt);
  }

  for (const prompt of agentPromptsResult) {
    promptMap.set(prompt.name, prompt);
  }

  return Array.from(promptMap.values());
}

// Update a prompt
export async function updatePrompt(params: UpdatePromptParams): Promise<AgentPrompt | undefined> {
  const now = Date.now();
  const existing = await getPrompt(params.promptId);

  if (!existing) {
    return undefined;
  }

  // Increment version if content changed
  let newVersion = existing.version;
  if (params.content !== undefined && params.content !== existing.content) {
    newVersion = existing.version + 1;
  }

  const updates: Partial<NewAgentPrompt> = {
    updatedAt: now,
  };

  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.content !== undefined) updates.content = params.content;
  if (params.isActive !== undefined) updates.isActive = params.isActive ? 1 : 0;
  if (params.content !== undefined && params.content !== existing.content) {
    updates.version = newVersion;
  }

  await db
    .update(agentPrompts)
    .set(updates)
    .where(eq(agentPrompts.id, params.promptId));

  return getPrompt(params.promptId);
}

// Delete a prompt (soft delete - sets isActive to 0)
export async function deletePrompt(promptId: string): Promise<boolean> {
  await db
    .update(agentPrompts)
    .set({ isActive: 0, updatedAt: Date.now() })
    .where(eq(agentPrompts.id, promptId));

  return true;
}

// Hard delete a prompt (use with caution)
export async function hardDeletePrompt(promptId: string): Promise<boolean> {
  await db
    .delete(agentPrompts)
    .where(eq(agentPrompts.id, promptId));

  return true;
}

// List all prompts (admin function)
export async function listAllPrompts(
  limit = 100,
  offset = 0
): Promise<AgentPrompt[]> {
  const results = await db
    .select()
    .from(agentPrompts)
    .orderBy(desc(agentPrompts.updatedAt))
    .limit(limit)
    .offset(offset);

  return results;
}

// Search prompts by name
export async function searchPrompts(
  query: string,
  limit = 50
): Promise<AgentPrompt[]> {
  const results = await db
    .select()
    .from(agentPrompts)
    .where(like(agentPrompts.name, `%${query}%`))
    .orderBy(desc(agentPrompts.updatedAt))
    .limit(limit);

  return results;
}
