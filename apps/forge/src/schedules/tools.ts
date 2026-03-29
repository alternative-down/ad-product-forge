import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';
import type { createAgentScheduleManager } from './manager';

const toggleScheduleInputSchema = z.object({
  scheduleId: z.string().min(1),
  isActive: z.boolean(),
});

export function createAgentScheduleTools(
  agentId: string,
  schedules: ReturnType<typeof createAgentScheduleManager>,
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, unknown> = {};

  if (hasToolPermission(allowedToolIds, 'list_agent_schedules')) {
    tools.list_agent_schedules = createTool({
      id: 'list_agent_schedules',
      description: 'View all your scheduled wakes including cron-based schedules and one-time scheduled tasks with their current active/paused status.',
      inputSchema: z.object({}),
      execute: async () => schedules.listSchedules(agentId),
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
      }).superRefine((input, ctx) => {
        if (input.scheduleType === 'cron' && !input.cronExpression) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cronExpression'], message: 'cronExpression is required when scheduleType is cron' });
        }
        if (input.scheduleType === 'date' && !input.scheduledDate) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scheduledDate'], message: 'scheduledDate is required when scheduleType is date' });
        }
      }),
      execute: async (input) => schedules.createSchedule(agentId, {
        name: input.name,
        description: input.description ?? undefined,
        scheduleType: input.scheduleType,
        cronExpression: input.cronExpression ?? undefined,
        scheduledDate: input.scheduledDate ?? undefined,
        timezone: input.timezone ?? 'UTC',
        content: input.content,
      }),
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
      }),
      execute: async (input) => schedules.updateSchedule(agentId, input.scheduleId, {
        name: input.name,
        description: input.description,
        scheduleType: input.scheduleType,
        cronExpression: input.cronExpression,
        scheduledDate: input.scheduledDate,
        timezone: input.timezone,
        content: input.content,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_agent_schedule')) {
    tools.delete_agent_schedule = createTool({
      id: 'delete_agent_schedule',
      description: 'Delete a scheduled wake permanently.',
      inputSchema: z.object({
        scheduleId: z.string().min(1).describe('The schedule ID to delete.'),
      }),
      execute: async (input) => schedules.deleteSchedule(agentId, input.scheduleId),
    });
  }

  if (hasToolPermission(allowedToolIds, 'toggle_agent_schedule')) {
    tools.toggle_agent_schedule = createTool({
      id: 'toggle_agent_schedule',
      description: 'Enable or disable a scheduled wake without deleting it. Paused schedules will not trigger until reactivated.',
      inputSchema: toggleScheduleInputSchema,
      execute: async (input) => schedules.updateSchedule(agentId, input.scheduleId, {
        isActive: input.isActive,
      }),
    });
  }

  // Cross-agent tools (spec v4)
  if (hasToolPermission(allowedToolIds, 'create_cron_for_agent')) {
    const createCronInputSchema = z.object({
      targetAgentId: z.string().min(1).describe('The agent ID to create the cron for'),
      name: z.string().min(1).describe('Name of the cron/schedule'),
      description: z.string().nullish().describe('Optional description'),
      scheduleType: z.enum(['cron', 'date']).describe('Type of schedule: cron for recurring, date for one-time'),
      cronExpression: z.string().min(1).nullish().describe('Cron expression (required for cron type)'),
      scheduledDate: z.string().min(1).nullish().describe('ISO date string (required for date type)'),
      timezone: z.string().min(1).default('UTC').describe('Timezone for the schedule'),
      content: z.string().min(1).describe('Content/payload to execute when the cron triggers'),
    }).superRefine((input, ctx) => {
      if (input.scheduleType === 'cron' && !input.cronExpression) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cronExpression'], message: 'cronExpression is required when scheduleType is cron' });
      }
      if (input.scheduleType === 'date' && !input.scheduledDate) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scheduledDate'], message: 'scheduledDate is required when scheduleType is date' });
      }
    });

    tools.create_cron_for_agent = createTool({
      id: 'create_cron_for_agent',
      description: 'Create a cron/schedule for another agent. The target agent will receive the cron content when it triggers. Only the creator can edit or delete.',
      inputSchema: createCronInputSchema,
      execute: async (input) => schedules.createScheduleForAgent(agentId, {
        targetAgentId: input.targetAgentId,
        name: input.name,
        description: input.description,
        scheduleType: input.scheduleType,
        cronExpression: input.cronExpression,
        scheduledDate: input.scheduledDate,
        timezone: input.timezone,
        content: input.content,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'edit_cron')) {
    const editCronInputSchema = z.object({
      scheduleId: z.string().min(1).describe('ID of the schedule to edit'),
      name: z.string().min(1).nullish().describe('New name'),
      description: z.string().nullish().nullable().describe('New description'),
      scheduleType: z.enum(['cron', 'date']).nullish().describe('New schedule type'),
      cronExpression: z.string().min(1).nullish().nullable().describe('New cron expression'),
      scheduledDate: z.string().min(1).nullish().nullable().describe('New scheduled date (ISO string)'),
      timezone: z.string().min(1).nullish().describe('New timezone'),
      content: z.string().min(1).nullish().describe('New content'),
      isActive: z.boolean().nullish().describe('Activate or pause the schedule'),
    }).superRefine((input, ctx) => {
      if (Object.keys(input).length <= 1) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one field besides scheduleId must be provided' });
      }
    });

    tools.edit_cron = createTool({
      id: 'edit_cron',
      description: 'Edit an existing cron/schedule. Only the creator (or owner for self-created crons) can edit.',
      inputSchema: editCronInputSchema,
      execute: async (input) => schedules.editCron(agentId, input.scheduleId, {
        name: input.name,
        description: input.description,
        scheduleType: input.scheduleType,
        cronExpression: input.cronExpression,
        scheduledDate: input.scheduledDate,
        timezone: input.timezone,
        content: input.content,
        isActive: input.isActive,
      }),
    });
  }

  if (hasToolPermission(allowedToolIds, 'delete_cron')) {
    const deleteCronInputSchema = z.object({
      scheduleId: z.string().min(1).describe('ID of the schedule to delete'),
    });

    tools.delete_cron = createTool({
      id: 'delete_cron',
      description: 'Delete a cron/schedule. Only the creator (or owner for self-created crons) can delete.',
      inputSchema: deleteCronInputSchema,
      execute: async (input) => schedules.deleteCron(agentId, input.scheduleId),
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
