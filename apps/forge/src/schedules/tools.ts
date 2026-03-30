import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';
import { forgeDebug } from '@mastra-engine/core';

import { hasToolPermission } from '../capabilities/catalog';
import type { createAgentScheduleManager } from './manager';

export function createAgentScheduleTools(
  agentId: string,
  schedules: ReturnType<typeof createAgentScheduleManager>,
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, unknown> = {};
  const taskTargetInputSchema = z.object({
    targetAgentId: z.string().min(1).describe('The target agent that should receive this scheduled task.'),
    name: z.string().min(1).describe('Name of the task.'),
    description: z.string().nullish().describe('Optional description.'),
    scheduleType: z.enum(['cron', 'date']).describe('Type of schedule: cron for recurring, date for one-time.'),
    cronExpression: z.string().min(1).nullish().describe('Cron expression (required for cron type).'),
    scheduledDate: z.string().min(1).nullish().describe('ISO date string (required for date type).'),
    timezone: z.string().min(1).default('UTC').describe('Timezone for the schedule.'),
    content: z.string().min(1).describe('Content/payload to execute when the task triggers.'),
  });
  const taskUpdateInputSchema = z.object({
    taskId: z.string().min(1).describe('ID of the scheduled task to update.'),
    name: z.string().min(1).nullish().describe('New name.'),
    description: z.string().nullish().nullable().describe('New description.'),
    scheduleType: z.enum(['cron', 'date']).nullish().describe('New schedule type.'),
    cronExpression: z.string().min(1).nullish().nullable().describe('New cron expression.'),
    scheduledDate: z.string().min(1).nullish().nullable().describe('New scheduled date (ISO string).'),
    timezone: z.string().min(1).nullish().describe('New timezone.'),
    content: z.string().min(1).nullish().describe('New content.'),
    isActive: z.boolean().nullish().describe('Activate or pause the task.'),
  });

  if (hasToolPermission(allowedToolIds, 'list_agent_schedules')) {
    tools.list_agent_schedules = createTool({
      id: 'list_agent_schedules',
      description: 'View all your scheduled wakes including cron-based schedules and one-time scheduled tasks with their current active/paused status.',
      inputSchema: z.object({}),
      execute: async () => {
        forgeDebug('tools:schedules', 'list_agent_schedules called', { agentId });
        const result = await schedules.listSchedules(agentId);
        forgeDebug('tools:schedules', 'list_agent_schedules result', { count: result.length });
        return result;
      },
    });
  }

  // --- Split Schedule tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'create_agent_schedule')) {
    tools.create_agent_schedule = createTool({
      id: 'create_agent_schedule',
      description: 'Create a scheduled wake for this agent using cron expressions for recurring tasks or specific dates for one-time triggers.',
      inputSchema: z.object({
        name: z.string().min(1).describe('Name for the schedule.'),
        description: z.string().nullish().nullable().describe('Optional description.'),
        scheduleType: z.enum(['cron', 'date']).describe('Type of schedule: cron for recurring, date for one-time.'),
        cronExpression: z.string().min(1).nullish().describe('Cron expression (required for cron type).'),
        scheduledDate: z.string().min(1).nullish().describe('ISO date string (required for date type).'),
        timezone: z.string().min(1).nullish().default('UTC').describe('Timezone for the schedule.'),
        content: z.string().min(1).describe('Content/payload to send when the schedule triggers.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:schedules', 'create_agent_schedule called', { agentId, input });
        if (input.scheduleType === 'cron' && !input.cronExpression) {
          forgeDebug('tools:schedules', 'create_agent_schedule validation failed', { reason: 'cronExpression required for cron type' });
          return { valid: false, error: 'cronExpression is required when scheduleType is cron' };
        }
        if (input.scheduleType === 'date' && !input.scheduledDate) {
          forgeDebug('tools:schedules', 'create_agent_schedule validation failed', { reason: 'scheduledDate required for date type' });
          return { valid: false, error: 'scheduledDate is required when scheduleType is date' };
        }
        const result = await schedules.createSchedule(agentId, {
          name: input.name,
          description: input.description ?? undefined,
          scheduleType: input.scheduleType,
          cronExpression: input.cronExpression ?? undefined,
          scheduledDate: input.scheduledDate ?? undefined,
          timezone: input.timezone ?? 'UTC',
          content: input.content,
        });
        forgeDebug('tools:schedules', 'create_agent_schedule success', { result });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_agent_schedule')) {
    tools.update_agent_schedule = createTool({
      id: 'update_agent_schedule',
      description: 'Update an existing scheduled wake. At least one field besides scheduleId must be provided.',
      inputSchema: z.object({
        scheduleId: z.string().min(1).describe('The schedule ID to update.'),
        name: z.string().min(1).nullish().describe('New name for the schedule.'),
        description: z.string().nullish().nullable().describe('New description.'),
        scheduleType: z.enum(['cron', 'date']).nullish().describe('New schedule type.'),
        cronExpression: z.string().min(1).nullish().describe('New cron expression.'),
        scheduledDate: z.string().min(1).nullish().describe('New date string.'),
        timezone: z.string().min(1).nullish().describe('New timezone.'),
        content: z.string().min(1).nullish().describe('New content/payload.'),
        isActive: z.boolean().nullish().describe('Enable or disable the schedule without deleting it.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:schedules', 'update_agent_schedule called', { agentId, scheduleId: input.scheduleId });
        const result = await schedules.updateSchedule(agentId, input.scheduleId, {
          name: input.name,
          description: input.description,
          scheduleType: input.scheduleType,
          cronExpression: input.cronExpression,
          scheduledDate: input.scheduledDate,
          timezone: input.timezone,
          content: input.content,
          isActive: input.isActive ?? undefined,
        });
        forgeDebug('tools:schedules', 'update_agent_schedule result', { result });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_agent_schedule')) {
    tools.delete_agent_schedule = createTool({
      id: 'delete_agent_schedule',
      description: 'Delete a scheduled wake permanently.',
      inputSchema: z.object({
        scheduleId: z.string().min(1).describe('The schedule ID to delete.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:schedules', 'delete_agent_schedule called', { agentId, scheduleId: input.scheduleId });
        const result = await schedules.deleteSchedule(agentId, input.scheduleId);
        forgeDebug('tools:schedules', 'delete_agent_schedule result', { result });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'create_task_for_agent')) {
    tools.create_task_for_agent = createTool({
      id: 'create_task_for_agent',
      description: 'Create a scheduled task for another agent. This is the cross-agent scheduling surface intended for coordinator-style delegation.',
      inputSchema: taskTargetInputSchema,
      execute: async (input) => {
        forgeDebug('tools:schedules', 'create_task_for_agent called', { agentId, targetAgentId: input.targetAgentId });
        if (input.scheduleType === 'cron' && !input.cronExpression) {
          forgeDebug('tools:schedules', 'create_task_for_agent validation failed', { reason: 'cronExpression required for cron type' });
          return { valid: false, error: 'cronExpression is required when scheduleType is cron' };
        }
        if (input.scheduleType === 'date' && !input.scheduledDate) {
          forgeDebug('tools:schedules', 'create_task_for_agent validation failed', { reason: 'scheduledDate required for date type' });
          return { valid: false, error: 'scheduledDate is required when scheduleType is date' };
        }

        const result = await schedules.createScheduleForAgent(agentId, {
          targetAgentId: input.targetAgentId,
          name: input.name,
          description: input.description,
          scheduleType: input.scheduleType,
          cronExpression: input.cronExpression,
          scheduledDate: input.scheduledDate,
          timezone: input.timezone,
          content: input.content,
        });

        forgeDebug('tools:schedules', 'create_task_for_agent result', { result });
        return {
          ...result,
          taskId: result.scheduleId,
        };
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_agent_tasks')) {
    tools.list_agent_tasks = createTool({
      id: 'list_agent_tasks',
      description: 'List scheduled tasks that you created for other agents. Optional targetAgentId filters the delegated tasks to one specific agent.',
      inputSchema: z.object({
        targetAgentId: z.string().min(1).nullish().describe('Optional target agent filter.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:schedules', 'list_agent_tasks called', { agentId, targetAgentId: input.targetAgentId });
        const result = await schedules.listTasks(agentId, input.targetAgentId ?? undefined);
        forgeDebug('tools:schedules', 'list_agent_tasks result', { count: result.length });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_agent_task')) {
    tools.update_agent_task = createTool({
      id: 'update_agent_task',
      description: 'Update a scheduled task that you created for another agent. Authorization is checked through creatorId.',
      inputSchema: taskUpdateInputSchema,
      execute: async (input) => {
        forgeDebug('tools:schedules', 'update_agent_task called', { agentId, taskId: input.taskId });
        const result = await schedules.editCron(agentId, input.taskId, {
          name: input.name,
          description: input.description,
          scheduleType: input.scheduleType,
          cronExpression: input.cronExpression,
          scheduledDate: input.scheduledDate,
          timezone: input.timezone,
          content: input.content,
          isActive: input.isActive,
        });
        forgeDebug('tools:schedules', 'update_agent_task result', { result });
        return {
          ...result,
          taskId: result.scheduleId,
        };
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'cancel_agent_task')) {
    tools.cancel_agent_task = createTool({
      id: 'cancel_agent_task',
      description: 'Cancel a scheduled task that you created for another agent. Authorization is checked through creatorId.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('ID of the scheduled task to cancel.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:schedules', 'cancel_agent_task called', { agentId, taskId: input.taskId });
        const result = await schedules.deleteCron(agentId, input.taskId);
        forgeDebug('tools:schedules', 'cancel_agent_task result', { result });
        return {
          ...result,
          taskId: input.taskId,
        };
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
