import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';
import { forgeDebug } from '@mastra-engine/core';

import { hasToolPermission } from '../capabilities/catalog';
import type { createAgentScheduleManager } from './manager';

const cronCreateFieldsSchema = {
  name: z.string().min(1).describe('A short name so you can recognize this cron later.'),
  description: z.string().nullish().nullable().describe('Optional note explaining what this cron is for.'),
  scheduleType: z.enum(['cron', 'date']).describe('Use "cron" for recurring execution or "date" for one-time execution.'),
  cronExpression: z.string().min(1).nullish().describe('The cron expression to use when scheduleType is "cron".'),
  scheduledDate: z.string().min(1).nullish().describe('The date and time to use when scheduleType is "date". Use an ISO string.'),
  timezone: z.string().min(1).default('UTC').describe('Timezone used to interpret the cron.'),
  content: z.string().min(1).describe('The message or task content that should be delivered when this cron runs.'),
} as const;

const cronUpdateFieldsSchema = {
  name: z.string().min(1).nullish().describe('New name for the cron.'),
  description: z.string().nullish().nullable().describe('New note explaining what this cron is for.'),
  scheduleType: z.enum(['cron', 'date']).nullish().describe('Change the cron to recurring cron or one-time date execution.'),
  cronExpression: z.string().min(1).nullish().nullable().describe('New cron expression when the cron should be recurring.'),
  scheduledDate: z.string().min(1).nullish().nullable().describe('New one-time execution date as an ISO string.'),
  timezone: z.string().min(1).nullish().describe('New timezone used to interpret the cron.'),
  content: z.string().min(1).nullish().describe('New content to deliver when the cron runs.'),
  isActive: z.boolean().nullish().describe('Set this to false to pause the cron without deleting it, or true to reactivate it.'),
} as const;

const manageSelfCronsInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']).describe('The cron operation to perform.'),
  cronId: z.string().min(1).nullish().describe('Required for update and delete.'),
  ...Object.fromEntries(
    Object.entries(cronCreateFieldsSchema).map(([key, schema]) => [key, schema.nullish()]),
  ),
  ...cronUpdateFieldsSchema,
});

const manageCronsInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']).describe('The delegated cron operation to perform.'),
  targetAgentId: z.string().min(1).nullish().describe('Required for delegated cron creation.'),
  cronId: z.string().min(1).nullish().describe('Required for update and delete.'),
  ...Object.fromEntries(
    Object.entries(cronCreateFieldsSchema).map(([key, schema]) => [key, schema.nullish()]),
  ),
  ...cronUpdateFieldsSchema,
});

function validateCreateTiming(input: {
  scheduleType: 'cron' | 'date' | null | undefined;
  cronExpression?: string | null;
  scheduledDate?: string | null;
}) {
  if (!input.scheduleType) {
    return {
      valid: false as const,
      error: 'scheduleType is required when action is create',
      hint: 'Use scheduleType cron for recurring execution or date for one-time execution.',
    };
  }

  if (input.scheduleType === 'cron' && !input.cronExpression) {
    return {
      valid: false as const,
      error: 'cronExpression is required when scheduleType is cron',
      hint: 'Provide a valid cron expression for recurring crons.',
    };
  }

  if (input.scheduleType === 'date' && !input.scheduledDate) {
    return {
      valid: false as const,
      error: 'scheduledDate is required when scheduleType is date',
      hint: 'Provide an ISO date string for one-time crons.',
    };
  }

  return null;
}

function validateCronUpdateTarget(input: { cronId?: string | null }) {
  if (input.cronId) {
    return null;
  }

  return {
    valid: false as const,
    error: 'cronId is required for update and delete',
    hint: 'Use list_self_crons or list_crons to get the cronId you want to change.',
  };
}

function validateDelegatedCronCreateTarget(input: { targetAgentId?: string | null }) {
  if (input.targetAgentId) {
    return null;
  }

  return {
    valid: false as const,
    error: 'targetAgentId is required when action is create',
    hint: 'Provide the agentId that should receive the delegated cron.',
  };
}

function toCronOutput<T extends { scheduleId?: string; taskId?: string }>(value: T) {
  const cronId = value.scheduleId ?? value.taskId;

  return {
    ...value,
    cronId,
  };
}

export function createAgentScheduleTools(
  agentId: string,
  schedules: ReturnType<typeof createAgentScheduleManager>,
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, unknown> = {};

  if (hasToolPermission(allowedToolIds, 'list_self_crons')) {
    tools.list_self_crons = createTool({
      id: 'list_self_crons',
      description: 'List your own crons. Use this to review your recurring or one-time scheduled executions and get the cronId needed for later changes.',
      inputSchema: z.object({}),
      execute: async () => {
        forgeDebug('tools:schedules', 'list_self_crons called', { agentId });
        try {
          const result = await schedules.listSchedules(agentId);
          forgeDebug('tools:schedules', 'list_self_crons result', { count: result.length });
          return result.map(toCronOutput);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Try again in a moment. If the problem persists, verify the cron store is available.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_self_crons')) {
    tools.manage_self_crons = createTool({
      id: 'manage_self_crons',
      description: 'Create, update, or delete your own crons. Use this for your own recurring wakes or one-time future executions.',
      inputSchema: manageSelfCronsInputSchema,
      execute: async (input) => {
        forgeDebug('tools:schedules', 'manage_self_crons called', { agentId, action: input.action });

        if (input.action === 'create') {
          const validation = validateCreateTiming(input);

          if (validation) {
            return validation;
          }

          try {
            const result = await schedules.createSchedule(agentId, {
              name: input.name,
              description: input.description ?? undefined,
              scheduleType: input.scheduleType,
              cronExpression: input.scheduleType === 'cron' ? input.cronExpression : undefined,
              scheduledDate: input.scheduleType === 'date' ? input.scheduledDate : undefined,
              timezone: input.timezone,
              content: input.content,
            });

            return {
              valid: true,
              ...toCronOutput(result),
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              valid: false,
              error: message,
              hint: 'Review the cron fields and try again. Use cron for recurring execution or date for one-time execution.',
            };
          }
        }

        if (input.action === 'update') {
          const validation = validateCronUpdateTarget(input);

          if (validation) {
            return validation;
          }

          try {
            const result = await schedules.updateSchedule(agentId, input.cronId, {
              name: input.name ?? undefined,
              description: input.description,
              scheduleType: input.scheduleType ?? undefined,
              cronExpression: input.cronExpression,
              scheduledDate: input.scheduledDate,
              timezone: input.timezone ?? undefined,
              content: input.content ?? undefined,
              isActive: input.isActive ?? undefined,
            });

            return {
              valid: true,
              ...toCronOutput(result),
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              valid: false,
              error: message,
              hint: 'Use list_self_crons to confirm the cronId is correct and belongs to this agent.',
            };
          }
        }

        const validation = validateCronUpdateTarget(input);

        if (validation) {
          return validation;
        }

        try {
          const result = await schedules.deleteSchedule(agentId, input.cronId);
          return {
            valid: true,
            cronId: input.cronId,
            ...result,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Use list_self_crons to confirm the cronId is correct and belongs to this agent.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_crons')) {
    tools.list_crons = createTool({
      id: 'list_crons',
      description: 'List the crons you created for other agents. Use this to review delegated scheduled executions and get the cronId needed for later changes.',
      inputSchema: z.object({
        targetAgentId: z.string().min(1).nullish().describe('Optional target agent id if you want to see only crons aimed at one specific agent.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:schedules', 'list_crons called', { agentId, targetAgentId: input.targetAgentId });
        try {
          const result = await schedules.listTasks(agentId, input.targetAgentId ?? undefined);
          forgeDebug('tools:schedules', 'list_crons result', { count: result.length });
          return result.map(toCronOutput);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Try again in a moment. If the problem persists, verify the delegated cron store is available.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_crons')) {
    tools.manage_crons = createTool({
      id: 'manage_crons',
      description: 'Create, update, or delete crons for other agents. Use this when you want another agent to receive recurring or one-time scheduled work.',
      inputSchema: manageCronsInputSchema,
      execute: async (input) => {
        forgeDebug('tools:schedules', 'manage_crons called', { agentId, action: input.action });

        if (input.action === 'create') {
          const createTargetValidation = validateDelegatedCronCreateTarget(input);

          if (createTargetValidation) {
            return createTargetValidation;
          }

          const validation = validateCreateTiming(input);

          if (validation) {
            return validation;
          }

          try {
            const result = await schedules.createScheduleForAgent(agentId, {
              targetAgentId: input.targetAgentId,
              name: input.name,
              description: input.description ?? undefined,
              scheduleType: input.scheduleType,
              cronExpression: input.scheduleType === 'cron' ? input.cronExpression : undefined,
              scheduledDate: input.scheduleType === 'date' ? input.scheduledDate : undefined,
              timezone: input.timezone,
              content: input.content,
            });

            return {
              valid: true,
              ...toCronOutput(result),
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              valid: false,
              error: message,
              hint: 'Verify the targetAgentId exists and that you have permission to create delegated crons.',
            };
          }
        }

        if (input.action === 'update') {
          const validation = validateCronUpdateTarget(input);

          if (validation) {
            return validation;
          }

          try {
            const result = await schedules.editCron(agentId, input.cronId, {
              name: input.name ?? undefined,
              description: input.description,
              scheduleType: input.scheduleType ?? undefined,
              cronExpression: input.cronExpression,
              scheduledDate: input.scheduledDate,
              timezone: input.timezone ?? undefined,
              content: input.content ?? undefined,
              isActive: input.isActive ?? undefined,
            });

            return {
              valid: true,
              ...toCronOutput(result),
            };
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            return {
              valid: false,
              error: message,
              hint: 'Use list_crons to confirm the cronId is correct and that you created this delegated cron.',
            };
          }
        }

        const validation = validateCronUpdateTarget(input);

        if (validation) {
          return validation;
        }

        try {
          const result = await schedules.deleteCron(agentId, input.cronId);
          return {
            valid: true,
            cronId: input.cronId,
            ...result,
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            valid: false,
            error: message,
            hint: 'Use list_crons to confirm the cronId is correct and that you created this delegated cron.',
          };
        }
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
