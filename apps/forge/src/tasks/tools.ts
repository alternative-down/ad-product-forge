/**
 * Task Tools — agent-to-agent task scheduling (Issue #225)
 *
 * Tools for coordinators to create, list, update, and cancel tasks for agents.
 * Requires COORDINATOR role (with graceful fallback until #242 deploys).
 */

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';
import {
  createTask,
  listAgentTasks,
  listCoordinatorTasks,
  updateTask,
  cancelTask,
  countCoordinatorTasksLastHour,
  countAgentTasks,
  hasDuplicateTask,
  type TaskPriority,
} from './store';
import { getDatabase } from '../database';

// Rate limit constants
const MAX_TASKS_PER_COORDINATOR_PER_HOUR = 10;
const MAX_TASKS_PER_AGENT_TOTAL = 100;

// Zod schemas
const createTaskForAgentInputSchema = z.object({
  targetAgentId: z.string().min(1, 'targetAgentId is required'),
  name: z.string().min(1, 'name is required'),
  description: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  scheduleType: z.enum(['cron', 'date']),
  cronExpression: z.string().min(1).optional(),
  scheduledDate: z.string().min(1), // ISO date string for date-based tasks
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1, 'content is required'),
}).superRefine((input, ctx) => {
  if (input.scheduleType === 'cron' && !input.cronExpression) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cronExpression'],
      message: 'cronExpression is required when scheduleType is cron',
    });
  }
  if (input.scheduleType === 'date' && !input.scheduledDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scheduledDate'],
      message: 'scheduledDate is required when scheduleType is date',
    });
  }
});

const listAgentTasksInputSchema = z.object({
  targetAgentId: z.string().min(1).optional(), // Filter by target agent (COORDINATOR only)
  status: z.enum(['pending', 'completed', 'failed', 'cancelled']).default('pending'),
  limit: z.number().int().positive().max(100).default(50),
});

const cancelAgentTaskInputSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
  agentId: z.string().min(1, 'agentId is required'), // Owner of the task
});

const updateAgentTaskInputSchema = z.object({
  taskId: z.string().min(1, 'taskId is required'),
  agentId: z.string().min(1, 'agentId is required'),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['pending', 'completed', 'failed']).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  isActive: z.boolean().optional(),
  result: z.string().optional().nullable(),
  error: z.string().optional().nullable(),
});

// Placeholder COORDINATOR role check (Issue #242 deploys actual role)
// This will be updated when #242 is deployed
async function checkCoordinatorRole(_agentId: string): Promise<boolean> {
  try {
    const db = getDatabase();
    // Check if agent has COORDINATOR role
    // This is a placeholder - the actual implementation will come with #242
    // For now, check if the role 'coordinator' exists in agent_roles
    const result = await db.all(`
      SELECT r.id FROM agent_roles r
      WHERE r.name = 'COORDINATOR'
      LIMIT 1
    `);

    if (!result || result.length === 0) {
      // Role doesn't exist yet - log warning and deny
      console.warn(`[TaskTools] COORDINATOR role not found. Grant role first (Issue #242).`);
      return false;
    }

    // TODO: Check if agentId has the COORDINATOR role assigned
    // This requires the role assignment table which comes with #242
    return false; // Placeholder - deny until #242 deploys with actual role check
  } catch (error) {
    console.error('[TaskTools] Error checking COORDINATOR role:', error);
    return false;
  }
}

export function createTaskTools(
  agentId: string,
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, unknown> = {};

  // Tool: create_task_for_agent
  // Creates a task to be executed by another agent (COORDINATOR only)
  if (hasToolPermission(allowedToolIds, 'create_task_for_agent')) {
    tools.create_task_for_agent = createTool({
      id: 'create_task_for_agent',
      description: 'Create a task for another agent to execute. Requires COORDINATOR role. Use this when you need to delegate work to a specific agent.',
      inputSchema: createTaskForAgentInputSchema,
      execute: async (input, context) => {
        const coordinatorId = context?.agentId ?? agentId;

        // Check COORDINATOR role
        const isCoordinator = await checkCoordinatorRole(coordinatorId);
        if (!isCoordinator) {
          throw new Error('COORDINATOR role required to create tasks for other agents. Please request the COORDINATOR role first (Issue #242).');
        }

        // Rate limit: check tasks per coordinator in last hour
        const coordinatorTaskCount = await countCoordinatorTasksLastHour(coordinatorId);
        if (coordinatorTaskCount >= MAX_TASKS_PER_COORDINATOR_PER_HOUR) {
          throw new Error(`Rate limit exceeded: max ${MAX_TASKS_PER_COORDINATOR_PER_HOUR} tasks per coordinator per hour.`);
        }

        // Rate limit: check tasks assigned to target agent
        const agentTaskCount = await countAgentTasks(input.targetAgentId);
        if (agentTaskCount >= MAX_TASKS_PER_AGENT_TOTAL) {
          throw new Error(`Rate limit exceeded: max ${MAX_TASKS_PER_AGENT_TOTAL} tasks per agent total.`);
        }

        // Duplicate check
        const scheduledDateMs = new Date(input.scheduledDate).getTime();
        const duplicate = await hasDuplicateTask(input.targetAgentId, scheduledDateMs);
        if (duplicate) {
          throw new Error(`Duplicate task: agent ${input.targetAgentId} already has a task scheduled for ${input.scheduledDate}.`);
        }

        // Create the task
        const task = await createTask({
          agentId: input.targetAgentId,
          name: input.name,
          description: input.description ?? null,
          taskType: 'task',
          priority: input.priority as TaskPriority,
          scheduleType: input.scheduleType,
          cronExpression: input.cronExpression ?? null,
          scheduledDate: scheduledDateMs,
          timezone: input.timezone,
          content: input.content,
          sourceCoordinatorId: coordinatorId,
          targetAgentId: input.targetAgentId,
        });

        return {
          success: true,
          taskId: task.id,
          message: `Task created successfully for agent ${input.targetAgentId}`,
          task: {
            id: task.id,
            name: task.name,
            targetAgentId: task.targetAgentId,
            status: task.status,
            priority: task.priority,
            scheduledDate: task.scheduledDate,
            timezone: task.timezone,
          },
        };
      },
    });
  }

  // Tool: list_agent_tasks
  // Lists tasks - own tasks if no filter, or filtered by targetAgentId (COORDINATOR only)
  if (hasToolPermission(allowedToolIds, 'list_agent_tasks')) {
    tools.list_agent_tasks = createTool({
      id: 'list_agent_tasks',
      description: 'List tasks. Without filter, shows only your own created tasks. With targetAgentId filter, requires COORDINATOR role.',
      inputSchema: listAgentTasksInputSchema,
      execute: async (input, context) => {
        const callerId = context?.agentId ?? agentId;

        // If filtering by targetAgentId, require COORDINATOR role
        if (input.targetAgentId) {
          const isCoordinator = await checkCoordinatorRole(callerId);
          if (!isCoordinator) {
            throw new Error('COORDINATOR role required to list tasks for other agents.');
          }
          const tasks = await listAgentTasks(input.targetAgentId, input.status, input.limit);
          return { tasks, filter: 'targetAgent', targetAgentId: input.targetAgentId };
        }

        // No filter - list own tasks
        const tasks = await listCoordinatorTasks(callerId, input.limit);
        return { tasks, filter: 'own', coordinatorId: callerId };
      },
    });
  }

  // Tool: cancel_agent_task
  // Cancels a task (owner or COORDINATOR only)
  if (hasToolPermission(allowedToolIds, 'cancel_agent_task')) {
    tools.cancel_agent_task = createTool({
      id: 'cancel_agent_task',
      description: 'Cancel a pending task. Only the task creator or a COORDINATOR can cancel.',
      inputSchema: cancelAgentTaskInputSchema,
      execute: async (input, _context) => {
        // TODO: Check if caller is owner or COORDINATOR
        // For now, allow cancellation (will add role check after #242)
        await cancelTask(input.taskId, input.agentId);

        return {
          success: true,
          taskId: input.taskId,
          message: `Task ${input.taskId} cancelled successfully`,
        };
      },
    });
  }

  // Tool: update_agent_task
  // Updates a task (owner or COORDINATOR only)
  if (hasToolPermission(allowedToolIds, 'update_agent_task')) {
    tools.update_agent_task = createTool({
      id: 'update_agent_task',
      description: 'Update a task status, priority, or other fields. Only the task creator or a COORDINATOR can update.',
      inputSchema: updateAgentTaskInputSchema,
      execute: async (input, _context) => {
        // TODO: Check if caller is owner or COORDINATOR
        // For now, allow updates (will add role check after #242)

        const task = await updateTask({
          taskId: input.taskId,
          agentId: input.agentId,
          name: input.name,
          description: input.description,
          status: input.status,
          priority: input.priority,
          isActive: input.isActive,
          result: input.result,
          error: input.error,
        });

        if (!task) {
          throw new Error(`Task ${input.taskId} not found`);
        }

        return {
          success: true,
          taskId: task.id,
          message: `Task ${input.taskId} updated successfully`,
          task,
        };
      },
    });
  }

  return tools;
}
