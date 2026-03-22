import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';
import type { createAgentScheduleManager } from './manager';

const manageScheduleInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']),
  scheduleId: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  scheduleType: z.enum(['cron', 'date']).optional(),
  cronExpression: z.string().min(1).optional().nullable(),
  scheduledDate: z.string().min(1).optional().nullable(),
  timezone: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
}).superRefine((input, ctx) => {
  if (input.action === 'create') {
    if (!input.name) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['name'], message: 'name is required when action is create' });
    }

    if (!input.scheduleType) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scheduleType'], message: 'scheduleType is required when action is create' });
    }

    if (!input.content) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['content'], message: 'content is required when action is create' });
    }
  }

  if (input.action === 'update' || input.action === 'delete') {
    if (!input.scheduleId) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['scheduleId'], message: 'scheduleId is required when action is not create' });
    }
  }

  if (input.action === 'update' && Object.keys(input).length <= 2) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one field besides action and scheduleId must be provided' });
  }
});

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
      description: 'List this agent scheduled wakes.',
      inputSchema: z.object({}),
      execute: async () => schedules.listSchedules(agentId),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_agent_schedule')) {
    tools.manage_agent_schedule = createTool({
      id: 'manage_agent_schedule',
      description: 'Create, update, or delete one scheduled wake for this agent.',
      inputSchema: manageScheduleInputSchema,
      execute: async (input) => {
        if (input.action === 'create') {
          return schedules.createSchedule(agentId, {
            name: input.name!,
            description: input.description ?? undefined,
            scheduleType: input.scheduleType!,
            cronExpression: input.cronExpression ?? undefined,
            scheduledDate: input.scheduledDate ?? undefined,
            timezone: input.timezone ?? 'UTC',
            content: input.content!,
          });
        }

        if (input.action === 'delete') {
          return schedules.deleteSchedule(agentId, input.scheduleId!);
        }

        return schedules.updateSchedule(agentId, input.scheduleId!, {
          name: input.name,
          description: input.description,
          scheduleType: input.scheduleType,
          cronExpression: input.cronExpression,
          scheduledDate: input.scheduledDate,
          timezone: input.timezone,
          content: input.content,
        });
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'toggle_agent_schedule')) {
    tools.toggle_agent_schedule = createTool({
      id: 'toggle_agent_schedule',
      description: 'Activate or pause one scheduled wake for this agent.',
      inputSchema: toggleScheduleInputSchema,
      execute: async (input) => schedules.updateSchedule(agentId, input.scheduleId, {
        isActive: input.isActive,
      }),
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
