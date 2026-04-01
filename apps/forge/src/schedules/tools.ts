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
  const createScheduleInputSchema = z.object({
    name: z.string().min(1).describe('A short name so you can recognize this schedule later.'),
    description: z.string().nullish().nullable().describe('Optional note explaining what this schedule is for.'),
    scheduleType: z.enum(['cron', 'date']).describe('Use "cron" for a recurring schedule or "date" for a one-time execution.'),
    cronExpression: z.string().min(1).nullish().describe('The cron expression to use when scheduleType is "cron".'),
    scheduledDate: z.string().min(1).nullish().describe('The date and time to use when scheduleType is "date". Use an ISO string.'),
    timezone: z.string().min(1).nullish().default('UTC').describe('Timezone used to interpret the schedule.'),
    content: z.string().min(1).describe('The message or task that should be delivered when the schedule runs.'),
  });
  const taskTargetInputSchema = z.object({
    targetAgentId: z.string().min(1).describe('The agent that should receive this scheduled task.'),
    name: z.string().min(1).describe('A short name so you can recognize this delegated task later.'),
    description: z.string().nullish().describe('Optional note explaining what this task is for.'),
    scheduleType: z.enum(['cron', 'date']).describe('Use "cron" for a recurring task or "date" for a one-time task.'),
    cronExpression: z.string().min(1).nullish().describe('The cron expression to use when scheduleType is "cron".'),
    scheduledDate: z.string().min(1).nullish().describe('The date and time to use when scheduleType is "date". Use an ISO string.'),
    timezone: z.string().min(1).default('UTC').describe('Timezone used to interpret the schedule.'),
    content: z.string().min(1).describe('The message or task the other agent should receive when this runs.'),
  });
  const taskUpdateInputSchema = z.object({
    taskId: z.string().min(1).describe('The taskId of the delegated task you want to update.'),
    name: z.string().min(1).nullish().describe('New name for the task.'),
    description: z.string().nullish().nullable().describe('New note explaining what this task is for.'),
    scheduleType: z.enum(['cron', 'date']).nullish().describe('Change the task to recurring cron or one-time date.'),
    cronExpression: z.string().min(1).nullish().nullable().describe('New cron expression when the task should be recurring.'),
    scheduledDate: z.string().min(1).nullish().nullable().describe('New one-time execution date as an ISO string.'),
    timezone: z.string().min(1).nullish().describe('New timezone used to interpret the schedule.'),
    content: z.string().min(1).nullish().describe('New message or task content to deliver when it runs.'),
    isActive: z.boolean().nullish().describe('Set this to false to pause the task without deleting it, or true to reactivate it.'),
  });

  if (hasToolPermission(allowedToolIds, 'list_agent_schedules')) {
    tools.list_agent_schedules = createTool({
      id: 'list_agent_schedules',
      description: 'List your own schedules. Use this to review your recurring wakes and one-time scheduled tasks, and to get the scheduleId needed for updates or deletion.',
      inputSchema: z.object({}),
      execute: async () => {
        forgeDebug('tools:schedules', 'list_agent_schedules called', { agentId });
        try {
          const result = await schedules.listSchedules(agentId);
          forgeDebug('tools:schedules', 'list_agent_schedules result', { count: result.length });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Try again in a moment. If the problem persists, verify the schedule store is available.',
          };
        }
      },
    });
  }

  // --- Split Schedule tools (individual operations) ---

  if (hasToolPermission(allowedToolIds, 'create_agent_schedule')) {
    tools.create_agent_schedule = createTool({
      id: 'create_agent_schedule',
      description: 'Create a schedule for yourself. Use this for your own recurring wakes or one-time future tasks. Returns the new scheduleId.',
      inputSchema: createScheduleInputSchema,
      execute: async (input) => {
        forgeDebug('tools:schedules', 'create_agent_schedule called', { agentId, input });
        if (input.scheduleType === 'cron' && !input.cronExpression) {
          forgeDebug('tools:schedules', 'create_agent_schedule validation failed', { reason: 'cronExpression required for cron type' });
          return { valid: false, error: 'cronExpression is required when scheduleType is cron', hint: 'Provide a valid cron expression for recurring schedules.' };
        }
        if (input.scheduleType === 'date' && !input.scheduledDate) {
          forgeDebug('tools:schedules', 'create_agent_schedule validation failed', { reason: 'scheduledDate required for date type' });
          return { valid: false, error: 'scheduledDate is required when scheduleType is date', hint: 'Provide an ISO date string for one-time schedules.' };
        }
        try {
          const result = await schedules.createSchedule(agentId, {
            name: input.name,
            description: input.description ?? undefined,
            scheduleType: input.scheduleType,
            cronExpression: input.scheduleType === 'cron' ? input.cronExpression : undefined,
            scheduledDate: input.scheduleType === 'date' ? input.scheduledDate : undefined,
            timezone: input.timezone ?? 'UTC',
            content: input.content,
          });
          forgeDebug('tools:schedules', 'create_agent_schedule success', { result });
          return {
            valid: true,
            ...result,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Review the schedule fields and try again. Use cron for recurring schedules or date for one-time schedules.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_agent_schedule')) {
    tools.update_agent_schedule = createTool({
      id: 'update_agent_schedule',
      description: 'Update one of your own schedules. Use this to change the name, timing, content, timezone, or active state of an existing schedule.',
      inputSchema: z.object({
        scheduleId: z.string().min(1).describe('The scheduleId of the schedule you want to update.'),
        name: z.string().min(1).nullish().describe('New name for the schedule.'),
        description: z.string().nullish().nullable().describe('New note explaining what this schedule is for.'),
        scheduleType: z.enum(['cron', 'date']).nullish().describe('Change the schedule to recurring cron or one-time date.'),
        cronExpression: z.string().min(1).nullish().describe('New cron expression when the schedule should be recurring.'),
        scheduledDate: z.string().min(1).nullish().describe('New one-time execution date as an ISO string.'),
        timezone: z.string().min(1).nullish().describe('New timezone used to interpret the schedule.'),
        content: z.string().min(1).nullish().describe('New message or task content to deliver when the schedule runs.'),
        isActive: z.boolean().nullish().describe('Set this to false to pause the schedule without deleting it, or true to reactivate it.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:schedules', 'update_agent_schedule called', { agentId, scheduleId: input.scheduleId });
        try {
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
          return {
            valid: true,
            ...result,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_schedules to confirm the scheduleId is correct and belongs to this agent.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_agent_schedule')) {
    tools.delete_agent_schedule = createTool({
      id: 'delete_agent_schedule',
      description: 'Delete one of your own schedules permanently. Use this when you no longer want that schedule to run again.',
      inputSchema: z.object({
        scheduleId: z.string().min(1).describe('The scheduleId of the schedule you want to delete.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:schedules', 'delete_agent_schedule called', { agentId, scheduleId: input.scheduleId });
        try {
          const result = await schedules.deleteSchedule(agentId, input.scheduleId);
          forgeDebug('tools:schedules', 'delete_agent_schedule result', { result });
          return {
            valid: true,
            scheduleId: input.scheduleId,
            ...result,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_schedules to confirm the scheduleId is correct and belongs to this agent.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'create_task_for_agent')) {
    tools.create_task_for_agent = createTool({
      id: 'create_task_for_agent',
      description: 'Create a scheduled task for another agent. Use this when you want another agent to receive work later, either once or on a recurring schedule. Returns the new taskId.',
      inputSchema: taskTargetInputSchema,
      execute: async (input) => {
        forgeDebug('tools:schedules', 'create_task_for_agent called', { agentId, targetAgentId: input.targetAgentId });
        if (input.scheduleType === 'cron' && !input.cronExpression) {
          forgeDebug('tools:schedules', 'create_task_for_agent validation failed', { reason: 'cronExpression required for cron type' });
          return { valid: false, error: 'cronExpression is required when scheduleType is cron', hint: 'Provide a valid cron expression for recurring tasks.' };
        }
        if (input.scheduleType === 'date' && !input.scheduledDate) {
          forgeDebug('tools:schedules', 'create_task_for_agent validation failed', { reason: 'scheduledDate required for date type' });
          return { valid: false, error: 'scheduledDate is required when scheduleType is date', hint: 'Provide an ISO date string for one-time tasks.' };
        }
        try {
          const result = await schedules.createScheduleForAgent(agentId, {
            targetAgentId: input.targetAgentId,
            name: input.name,
            description: input.description,
            scheduleType: input.scheduleType,
            cronExpression: input.scheduleType === 'cron' ? input.cronExpression : undefined,
            scheduledDate: input.scheduleType === 'date' ? input.scheduledDate : undefined,
            timezone: input.timezone,
            content: input.content,
          });

          forgeDebug('tools:schedules', 'create_task_for_agent result', { result });
          return {
            valid: true,
            ...result,
            taskId: result.scheduleId,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Verify the targetAgentId exists and that you have permission to manage delegated tasks.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_agent_tasks')) {
    tools.list_agent_tasks = createTool({
      id: 'list_agent_tasks',
      description: 'List the delegated tasks you created for other agents. Use this to review them and get the taskId needed for updates or cancellation.',
      inputSchema: z.object({
        targetAgentId: z.string().min(1).nullish().describe('Optional agentId if you want to see only tasks aimed at one specific agent.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:schedules', 'list_agent_tasks called', { agentId, targetAgentId: input.targetAgentId });
        try {
          const result = await schedules.listTasks(agentId, input.targetAgentId ?? undefined);
          forgeDebug('tools:schedules', 'list_agent_tasks result', { count: result.length });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Try again in a moment. If the problem persists, verify the delegated task store is available.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'update_agent_task')) {
    tools.update_agent_task = createTool({
      id: 'update_agent_task',
      description: 'Update a delegated task that you created for another agent. Use this to change the timing, content, name, or active state of that task.',
      inputSchema: taskUpdateInputSchema,
      execute: async (input) => {
        forgeDebug('tools:schedules', 'update_agent_task called', { agentId, taskId: input.taskId });
        try {
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
            valid: true,
            ...result,
            taskId: result.scheduleId,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_tasks to confirm the taskId is correct and that you created this delegated task.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'cancel_agent_task')) {
    tools.cancel_agent_task = createTool({
      id: 'cancel_agent_task',
      description: 'Cancel a delegated task that you created for another agent. Use this when you no longer want that task to run.',
      inputSchema: z.object({
        taskId: z.string().min(1).describe('The taskId of the delegated task you want to cancel.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:schedules', 'cancel_agent_task called', { agentId, taskId: input.taskId });
        try {
          const result = await schedules.deleteCron(agentId, input.taskId);
          forgeDebug('tools:schedules', 'cancel_agent_task result', { result });
          return {
            valid: true,
            ...result,
            taskId: input.taskId,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Use list_agent_tasks to confirm the taskId is correct and that you created this delegated task.',
          };
        }
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
