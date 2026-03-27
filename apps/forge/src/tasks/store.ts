/**
 * Task Store — agent-to-agent task scheduling (Issue #225 rework)
 *
 * Uses agent_schedules table with additional columns for cross-agent task management.
 * Reuses pattern from schedules/store.ts.
 */

import { eq, and, desc, sql } from 'drizzle-orm';
import { getDatabase } from '../database';
import { agentSchedules, type AgentSchedule, type NewAgentSchedule } from '../database/schema';

const db = getDatabase();

export type TaskType = 'schedule' | 'task';
export type TaskStatus = 'pending' | 'completed' | 'failed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type ScheduleType = 'cron' | 'date';

export interface CreateTaskParams {
  agentId: string;
  name: string;
  description?: string | null;
  taskType: TaskType;
  priority?: TaskPriority;
  scheduleType: ScheduleType;
  cronExpression?: string | null;
  scheduledDate?: number | null;
  timezone?: string;
  content: string;
  sourceCoordinatorId?: string | null;
  targetAgentId?: string | null;
}

export interface UpdateTaskParams {
  taskId: string;
  agentId: string;
  name?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  isActive?: boolean;
  result?: string | null;
  error?: string | null;
  lastTriggeredAt?: number | null;
  nextTriggerAt?: number | null;
}

// TaskRecord type alias for compatibility
export type TaskRecord = AgentSchedule;

// Create a new task (for self or assigned to another agent)
export async function createTask(params: CreateTaskParams): Promise<AgentSchedule> {
  const now = Date.now();
  const id = `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const newTask: NewAgentSchedule = {
    id,
    agentId: params.agentId,
    kind: 'agent',
    name: params.name,
    description: params.description ?? null,
    scheduleType: params.scheduleType,
    cronExpression: params.cronExpression ?? null,
    scheduledDate: params.scheduledDate ?? null,
    timezone: params.timezone ?? 'UTC',
    content: params.content,
    isActive: 1,
    lastTriggeredAt: null,
    nextTriggerAt: null,
    // Cross-agent task fields
    sourceCoordinatorId: params.sourceCoordinatorId ?? null,
    targetAgentId: params.targetAgentId ?? null,
    taskType: params.taskType,
    status: 'pending',
    priority: params.priority ?? 'normal',
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(agentSchedules).values(newTask);
  return newTask as AgentSchedule;
}

// List tasks for an agent (heartbeat query)
export async function listAgentTasks(
  targetAgentId: string,
  status: TaskStatus = 'pending',
  limit = 50
): Promise<AgentSchedule[]> {
  const results = await db
    .select()
    .from(agentSchedules)
    .where(
      and(
        eq(agentSchedules.targetAgentId, targetAgentId),
        eq(agentSchedules.taskType, 'task'),
        eq(agentSchedules.status, status),
        eq(agentSchedules.isActive, 1)
      )
    )
    .orderBy(agentSchedules.scheduledDate, agentSchedules.createdAt)
    .limit(limit);

  return results;
}

// List tasks created by a coordinator
export async function listCoordinatorTasks(
  sourceCoordinatorId: string,
  limit = 100
): Promise<AgentSchedule[]> {
  const results = await db
    .select()
    .from(agentSchedules)
    .where(
      and(
        eq(agentSchedules.sourceCoordinatorId, sourceCoordinatorId),
        eq(agentSchedules.taskType, 'task')
      )
    )
    .orderBy(desc(agentSchedules.createdAt))
    .limit(limit);

  return results;
}

// Get a single task by ID
export async function getTask(taskId: string, agentId: string): Promise<AgentSchedule | undefined> {
  const result = await db
    .select()
    .from(agentSchedules)
    .where(and(eq(agentSchedules.id, taskId), eq(agentSchedules.agentId, agentId)))
    .limit(1);

  return result[0];
}

// Update a task
export async function updateTask(params: UpdateTaskParams): Promise<AgentSchedule | undefined> {
  const now = Date.now();

  const updates: Partial<NewAgentSchedule> = {
    updatedAt: now,
  };

  if (params.name !== undefined) updates.name = params.name;
  if (params.description !== undefined) updates.description = params.description;
  if (params.status !== undefined) updates.status = params.status;
  if (params.priority !== undefined) updates.priority = params.priority;
  if (params.isActive !== undefined) updates.isActive = params.isActive ? 1 : 0;
  if (params.result !== undefined) updates.result = params.result;
  if (params.error !== undefined) updates.error = params.error;
  if (params.lastTriggeredAt !== undefined) updates.lastTriggeredAt = params.lastTriggeredAt;
  if (params.nextTriggerAt !== undefined) updates.nextTriggerAt = params.nextTriggerAt;

  await db
    .update(agentSchedules)
    .set(updates)
    .where(and(eq(agentSchedules.id, params.taskId), eq(agentSchedules.agentId, params.agentId)));

  return getTask(params.taskId, params.agentId);
}

// Cancel a task (soft delete - sets status to cancelled)
export async function cancelTask(taskId: string, agentId: string): Promise<boolean> {
  await db
    .update(agentSchedules)
    .set({ status: 'cancelled', isActive: 0, updatedAt: Date.now() })
    .where(and(eq(agentSchedules.id, taskId), eq(agentSchedules.agentId, agentId)));

  return true;
}

// Mark task as completed
export async function completeTask(taskId: string, agentId: string, result?: string): Promise<boolean> {
  await db
    .update(agentSchedules)
    .set({ status: 'completed', isActive: 0, result: result ?? null, updatedAt: Date.now() })
    .where(and(eq(agentSchedules.id, taskId), eq(agentSchedules.agentId, agentId)));

  return true;
}

// Mark task as failed
export async function failTask(taskId: string, agentId: string, error?: string): Promise<boolean> {
  await db
    .update(agentSchedules)
    .set({ status: 'failed', error: error ?? null, updatedAt: Date.now() })
    .where(and(eq(agentSchedules.id, taskId), eq(agentSchedules.agentId, agentId)));

  return true;
}

// Count tasks created by coordinator in the last hour (for rate limiting)
export async function countCoordinatorTasksLastHour(sourceCoordinatorId: string): Promise<number> {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentSchedules)
    .where(
      and(
        eq(agentSchedules.sourceCoordinatorId, sourceCoordinatorId),
        eq(agentSchedules.taskType, 'task'),
        sql`${agentSchedules.createdAt} >= ${oneHourAgo}`
      )
    );

  return result[0]?.count ?? 0;
}

// Count total tasks assigned to an agent (for rate limiting)
export async function countAgentTasks(targetAgentId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentSchedules)
    .where(
      and(
        eq(agentSchedules.targetAgentId, targetAgentId),
        eq(agentSchedules.taskType, 'task')
      )
    );

  return result[0]?.count ?? 0;
}

// Check for duplicate tasks at the same scheduled time
export async function hasDuplicateTask(targetAgentId: string, scheduledDateMs: number): Promise<boolean> {
  const timeWindow = 60 * 1000; // 1 minute window
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(agentSchedules)
    .where(
      and(
        eq(agentSchedules.targetAgentId, targetAgentId),
        eq(agentSchedules.taskType, 'task'),
        eq(agentSchedules.status, 'pending'),
        sql`${agentSchedules.scheduledDate} >= ${scheduledDateMs - timeWindow}`,
        sql`${agentSchedules.scheduledDate} <= ${scheduledDateMs + timeWindow}`
      )
    );

  return (result[0]?.count ?? 0) > 0;
}
