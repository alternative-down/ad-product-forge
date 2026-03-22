import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import type { createAgentScheduleManager } from './manager';

const createScheduleInputSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scheduleType: z.enum(['cron', 'date']),
  cronExpression: z.string().min(1).optional(),
  scheduledDate: z.string().min(1).optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
});

const updateScheduleInputSchema = z.object({
  scheduleId: z.string().min(1),
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  scheduleType: z.enum(['cron', 'date']).optional(),
  cronExpression: z.string().min(1).optional().nullable(),
  scheduledDate: z.string().min(1).optional().nullable(),
  timezone: z.string().min(1).optional(),
  content: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
}).refine((input) => Object.keys(input).length > 1, {
  message: 'At least one field besides scheduleId must be provided',
});

const scheduleIdInputSchema = z.object({
  scheduleId: z.string().min(1),
});

function canCreateTool(allowedToolIds: Set<string> | null | undefined, toolId: string) {
  return !allowedToolIds || allowedToolIds.has(toolId);
}

export function createAgentScheduleTools(
  agentId: string,
  schedules: ReturnType<typeof createAgentScheduleManager>,
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, unknown> = {};

  if (canCreateTool(allowedToolIds, 'create_agent_schedule')) {
    tools.create_agent_schedule = createTool({
      id: 'create_agent_schedule',
      description: 'Create a scheduled wake for this agent. The schedule will later create a notification and wake this agent with the provided content.',
      inputSchema: createScheduleInputSchema,
      execute: async (input) => schedules.createSchedule(agentId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'list_agent_schedules')) {
    tools.list_agent_schedules = createTool({
      id: 'list_agent_schedules',
      description: 'List this agent scheduled wakes.',
      inputSchema: z.object({}),
      execute: async () => schedules.listSchedules(agentId),
    });
  }

  if (canCreateTool(allowedToolIds, 'update_agent_schedule')) {
    tools.update_agent_schedule = createTool({
      id: 'update_agent_schedule',
      description: 'Partially update one scheduled wake for this agent.',
      inputSchema: updateScheduleInputSchema,
      execute: async ({ scheduleId, ...input }) => schedules.updateSchedule(agentId, scheduleId, input),
    });
  }

  if (canCreateTool(allowedToolIds, 'delete_agent_schedule')) {
    tools.delete_agent_schedule = createTool({
      id: 'delete_agent_schedule',
      description: 'Delete one scheduled wake for this agent.',
      inputSchema: scheduleIdInputSchema,
      execute: async (input) => schedules.deleteSchedule(agentId, input.scheduleId),
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
