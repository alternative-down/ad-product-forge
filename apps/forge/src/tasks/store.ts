/**
 * Task Store — agent-to-agent task scheduling (Issue #225)
 *
 * Manages scheduled_tasks table for coordinator-assigned tasks.
 * Reuses pattern from schedules/store.ts.
 */

import { eq, and, sql, desc } from 'drizzle-orm';
import { getDatabase } from '../database';
import { scheduledTasks, type ScheduledTask, type NewScheduledTask } from '../database/schema';
import { generateId } from './id';

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

// TaskRecord type alias for future extensibility
export type TaskRecord = ScheduledTask;

// Create a new task (for self or assigned to another agent)
export async function createTask(params: CreateTaskParams): Promise<ScheduledTask> {
  const now = Date.now();
  const id = generateId();

  const newTask: NewScheduledTask = {
    id,
    agentId: params.agentId,
    name: params.name,
    description: params.description ?? null,
    taskType: params.taskType,
    status: 'pending',
    priority: params.priority ?? 'normal',
    scheduleType: params.scheduleType,
    cronExpression: params.cronExpression ?? null,
    scheduledDate: params.scheduledDate ?? null,
    timezone: params.timezone ?? 'UTC',
    content: params.content,
    result: null,
    error: null,
    isActive: 1,
    sourceCoordinatorId: params.sourceCoordinatorId ?? null,
    targetAgentId: params.targetAgentId ?? null,
    lastTriggeredAt: null,
    nextTriggerAt: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(scheduledTasks).values(newTask);
  return newTask;
}

// List tasks for an agent (heartbeat query)
export async function listAgentTasks(
  targetAgentId: string,
  status: TaskStatus = 'pending',
  limit = 50
): Promise<ScheduledTask[]> {
  const results = await db
    .select()
    .from(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.targetAgentId, targetAgentId),
        eq(scheduledTasks.taskType, 'task'),
        eq(scheduledTasks.status, status),
        eq(scheduledTasks.isActive, 1)
      )
    )
    .orderBy(scheduledTasks.scheduledDate, scheduledTasks.createdAt)
    .limit(limit);

  return results;
}

// List tasks created by a coordinator
export async function listCoordinatorTasks(
  sourceCoordinatorId: string,
  limit = 100
): Promise<ScheduledTask[]> {
  const results = await db
    .select()
    .from(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.sourceCoordinatorId, sourceCoordinatorId),
        eq(scheduledTasks.taskType, 'task')
      )
    )
    .orderBy(desc(scheduledTasks.createdAt))
    .limit(limit);

  return results;
}

// Get a single task by ID
export async function getTask(taskId: string, agentId: string): Promise<ScheduledTask | undefined> {
  const result = await db
    .select()
    .from(scheduledTasks)
    .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.agentId, agentId)))
    .limit(1);

  return result[0];
}

// Update a task
export async function updateTask(params: UpdateTaskParams): Promise<ScheduledTask | undefined> {
  const now = Date.now();

  const updates: Partial<NewScheduledTask> = {
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
    .update(scheduledTasks)
    .set(updates)
    .where(and(eq(scheduledTasks.id, params.taskId), eq(scheduledTasks.agentId, params.agentId)));

  return getTask(params.taskId, params.agentId);
}

// Cancel a task (soft delete - sets status to cancelled)
export async function cancelTask(taskId: string, agentId: string): Promise<boolean> {
  await db
    .update(scheduledTasks)
    .set({ status: 'cancelled', isActive: 0, updatedAt: Date.now() })
    .where(and(eq(scheduledTasks.id, taskId), eq(scheduledTasks.agentId, agentId)));

  return true;
}

// Mark task as completed with result
export async function completeTask(
  taskId: string,
  result: string,
  lastTriggeredAt: number
): Promise<void> {
  await db
    .update(scheduledTasks)
    .set({
      status: 'completed',
      isActive: 0,
      result,
      lastTriggeredAt,
      updatedAt: Date.now(),
    })
    .where(eq(scheduledTasks.id, taskId));
}

// Mark task as failed with error
export async function failTask(
  taskId: string,
  error: string,
  lastTriggeredAt: number
): Promise<void> {
  await db
    .update(scheduledTasks)
    .set({
      status: 'failed',
      isActive: 0,
      error,
      lastTriggeredAt,
      updatedAt: Date.now(),
    })
    .where(eq(scheduledTasks.id, taskId));
}

// Rate limit: count tasks created by coordinator in last hour
export async function countCoordinatorTasksLastHour(coordinatorId: string): Promise<number> {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;

  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.sourceCoordinatorId, coordinatorId),
        eq(scheduledTasks.taskType, 'task'),
        sql`${scheduledTasks.createdAt} > ${oneHourAgo}`
      )
    );

  return result[0]?.count ?? 0;
}

// Rate limit: count tasks assigned to an agent (total)
export async function countAgentTasks(agentId: string): Promise<number> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.targetAgentId, agentId),
        eq(scheduledTasks.taskType, 'task')
      )
    );

  return result[0]?.count ?? 0;
}

// Check for duplicate task (same agent, same scheduled time)
export async function hasDuplicateTask(
  targetAgentId: string,
  scheduledDate: number
): Promise<boolean> {
  const result = await db
    .select({ count: sql<number>`count(*)` })
    .from(scheduledTasks)
    .where(
      and(
        eq(scheduledTasks.targetAgentId, targetAgentId),
        eq(scheduledTasks.taskType, 'task'),
        eq(scheduledTasks.scheduledDate, scheduledDate),
        eq(scheduledTasks.status, 'pending')
      )
    );

  return (result[0]?.count ?? 0) > 0;
}
