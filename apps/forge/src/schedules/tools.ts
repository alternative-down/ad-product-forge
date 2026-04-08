import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';
import { forgeDebug } from '@mastra-engine/core';

import { hasToolPermission } from '../capabilities/catalog';
import type { createAgentScheduleManager } from './manager';

const manageSelfCronsInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']).describe('The cron operation to perform.'),
  cronId: z.string().nullish().describe('Required for update and delete. Omit this field when creating a cron.'),
  name: z.string().nullish().describe('Cron name. Required for create. Do not send null when creating.'),
  description: z.string().nullish().describe('Optional note explaining what this cron is for.'),
  scheduleType: z.enum(['cron', 'date']).nullish().describe('Required for create. Use the literal string cron for recurring execution or date for one-time execution. Do not send null when creating.'),
  cronExpression: z.string().nullish().describe('Required when action is create and scheduleType is cron. Example: 0 * * * *.'),
  scheduledDate: z.string().nullish().describe('Required when action is create and scheduleType is date. Use an ISO string.'),
  timezone: z.string().nullish().describe('Optional timezone. If omitted, UTC is used.'),
  content: z.string().nullish().describe('Required for create. This is the message or task content that should be delivered when the cron runs. Do not send null when creating.'),
  isActive: z.boolean().nullish().describe('Set this to false to pause the cron without deleting it, or true to reactivate it.'),
});

const manageCronsInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']).describe('The delegated cron operation to perform.'),
  targetAgentId: z.string().nullish().describe('Required for delegated cron creation. Do not send null when creating a delegated cron.'),
  cronId: z.string().nullish().describe('Required for update and delete. Omit this field when creating a cron.'),
  name: z.string().nullish().describe('Cron name. Required for create. Do not send null when creating.'),
  description: z.string().nullish().describe('Optional note explaining what this cron is for.'),
  scheduleType: z.enum(['cron', 'date']).nullish().describe('Required for create. Use the literal string cron for recurring execution or date for one-time execution. Do not send null when creating.'),
  cronExpression: z.string().nullish().describe('Required when action is create and scheduleType is cron. Example: 0 * * * *.'),
  scheduledDate: z.string().nullish().describe('The date and time to use when scheduleType is date. Use an ISO string.'),
  timezone: z.string().nullish().describe('Timezone used to interpret the cron.'),
  content: z.string().nullish().describe('Required for create. This is the message or task content that should be delivered when the cron runs. Do not send null when creating.'),
  isActive: z.boolean().nullish().describe('Set this to false to pause the cron without deleting it, or true to reactivate it.'),
});

function validateCreateTiming(input: {
  name?: string | null;
  scheduleType: 'cron' | 'date' | null | undefined;
  cronExpression?: string | null;
  scheduledDate?: string | null;
  content?: string | null;
}) {
  if (!input.name) {
    return {
      valid: false as const,
      error: 'name is required when action is create',
      hint: 'Create calls must send a real name, not null. Example: { action: "create", name: "Burn Rate Report", scheduleType: "cron", cronExpression: "0 * * * *", content: "..." }',
    };
  }

  if (!input.scheduleType) {
    return {
      valid: false as const,
      error: 'scheduleType is required when action is create',
      hint: 'Create calls must send scheduleType as the literal string "cron" or "date", not null.',
    };
  }

  if (input.scheduleType === 'cron' && !input.cronExpression) {
    return {
      valid: false as const,
      error: 'cronExpression is required when scheduleType is cron',
      hint: 'For recurring crons, send cronExpression with a real value such as "0 * * * *".',
    };
  }

  if (input.scheduleType === 'date' && !input.scheduledDate) {
    return {
      valid: false as const,
      error: 'scheduledDate is required when scheduleType is date',
      hint: 'Provide an ISO date string for one-time crons.',
    };
  }

  if (!input.content) {
    return {
      valid: false as const,
      error: 'content is required when action is create',
      hint: 'Create calls must send the cron content with a real string, not null.',
    };
  }

  return null;
}

function normalizeCronId(input: {
  cronId?: string;
}) {
  return input.cronId ?? null;
}

async function resolveSelfCronId(input: {
  cronId?: string;
}, agentId: string, schedules: ReturnType<typeof createAgentScheduleManager>) {
  const cronId = normalizeCronId(input);

  if (cronId) {
    return cronId;
  }

  const ownCrons = await schedules.listSchedules(agentId);

  if (ownCrons.length === 1) {
    return ownCrons[0].scheduleId;
  }

  return null;
}

async function resolveDelegatedCronId(input: {
  cronId?: string;
  targetAgentId?: string;
}, creatorAgentId: string, schedules: ReturnType<typeof createAgentScheduleManager>) {
  const cronId = normalizeCronId(input);

  if (cronId) {
    return cronId;
  }

  const delegatedCrons = await schedules.listTasks(creatorAgentId, input.targetAgentId ?? undefined);

  if (delegatedCrons.length === 1) {
    return delegatedCrons[0].scheduleId;
  }

  return null;
}

function validateDelegatedCronCreateTarget(input: { targetAgentId?: string }) {
  if (input.targetAgentId) {
    return null;
  }

  return {
    valid: false as const,
    error: 'targetAgentId is required when action is create',
    hint: 'Provide the agentId that should receive the delegated cron.',
  };
}

function normalizeOptionalText(value?: string) {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toCronOutput<T extends { scheduleId?: string; taskId?: string }>(value: T) {
  const cronId = value.scheduleId ?? value.taskId;
  const { scheduleId: _scheduleId, taskId: _taskId, ...rest } = value;

  return {
    ...rest,
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
        forgeDebug('tools:schedules', 'manage_self_crons called', { agentId, action: input.action, input });

        if (input.action === 'create') {
          const validation = validateCreateTiming(input);

          if (validation) {
            return validation;
          }

          try {
            const result = await schedules.createSchedule(agentId, {
              name: input.name,
              description: normalizeOptionalText(input.description),
              scheduleType: input.scheduleType,
              cronExpression: input.scheduleType === 'cron' ? input.cronExpression : undefined,
              scheduledDate: input.scheduleType === 'date' ? input.scheduledDate : undefined,
              timezone: input.timezone ?? 'UTC',
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
          const cronId = await resolveSelfCronId(input, agentId, schedules);

          if (!cronId) {
            return {
              valid: false as const,
              error: 'cronId is required for update and delete',
              hint: 'Use list_self_crons to get the cronId. If you only have one cron, the tool can resolve it automatically.',
            };
          }

          try {
            const result = await schedules.updateSchedule(agentId, cronId, {
              name: normalizeOptionalText(input.name),
              description: normalizeOptionalText(input.description),
              scheduleType: input.scheduleType ?? undefined,
              cronExpression: normalizeOptionalText(input.cronExpression),
              scheduledDate: normalizeOptionalText(input.scheduledDate),
              timezone: normalizeOptionalText(input.timezone),
              content: normalizeOptionalText(input.content),
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

        const cronId = await resolveSelfCronId(input, agentId, schedules);

        if (!cronId) {
          return {
            valid: false as const,
            error: 'cronId is required for update and delete',
            hint: 'Use list_self_crons to get the cronId. If you only have one cron, the tool can resolve it automatically.',
          };
        }

        try {
          const result = await schedules.deleteSchedule(agentId, cronId);
          return {
            valid: true,
            cronId,
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
        forgeDebug('tools:schedules', 'manage_crons called', { agentId, action: input.action, input });

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
              description: normalizeOptionalText(input.description),
              scheduleType: input.scheduleType,
              cronExpression: input.scheduleType === 'cron' ? input.cronExpression : undefined,
              scheduledDate: input.scheduleType === 'date' ? input.scheduledDate : undefined,
              timezone: input.timezone ?? 'UTC',
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
          const cronId = await resolveDelegatedCronId(input, agentId, schedules);

          if (!cronId) {
            return {
              valid: false as const,
              error: 'cronId is required for update and delete',
              hint: 'Use list_crons to get the cronId. If there is only one matching delegated cron, the tool can resolve it automatically.',
            };
          }

          try {
            const result = await schedules.editCron(agentId, cronId, {
              name: normalizeOptionalText(input.name),
              description: normalizeOptionalText(input.description),
              scheduleType: input.scheduleType ?? undefined,
              cronExpression: normalizeOptionalText(input.cronExpression),
              scheduledDate: normalizeOptionalText(input.scheduledDate),
              timezone: normalizeOptionalText(input.timezone),
              content: normalizeOptionalText(input.content),
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

        const cronId = await resolveDelegatedCronId(input, agentId, schedules);

        if (!cronId) {
          return {
            valid: false as const,
            error: 'cronId is required for update and delete',
            hint: 'Use list_crons to get the cronId. If there is only one matching delegated cron, the tool can resolve it automatically.',
          };
        }

        try {
          const result = await schedules.deleteCron(agentId, cronId);
          return {
            valid: true,
            cronId,
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
