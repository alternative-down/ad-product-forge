import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { createAgentScheduleManager } from './manager.js';

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

export function createAgentScheduleTools(
  agentId: string,
  schedules: ReturnType<typeof createAgentScheduleManager>,
) {
  return {
    create_agent_schedule: createTool({
      id: 'create_agent_schedule',
      description: 'Create a scheduled wake for this agent. The schedule will later create a notification and wake this agent with the provided content.',
      inputSchema: createScheduleInputSchema,
      execute: async (input) => schedules.createSchedule(agentId, input),
    }),
    list_agent_schedules: createTool({
      id: 'list_agent_schedules',
      description: 'List this agent scheduled wakes.',
      inputSchema: z.object({}),
      execute: async () => schedules.listSchedules(agentId),
    }),
    update_agent_schedule: createTool({
      id: 'update_agent_schedule',
      description: 'Partially update one scheduled wake for this agent.',
      inputSchema: updateScheduleInputSchema,
      execute: async ({ scheduleId, ...input }) => schedules.updateSchedule(agentId, scheduleId, input),
    }),
    delete_agent_schedule: createTool({
      id: 'delete_agent_schedule',
      description: 'Delete one scheduled wake for this agent.',
      inputSchema: scheduleIdInputSchema,
      execute: async (input) => schedules.deleteSchedule(agentId, input.scheduleId),
    }),
  };
}
