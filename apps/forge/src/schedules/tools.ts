import { createTool, type Tool } from '@forge-runtime/core';
import { z } from 'zod';
import { forgeDebug } from '@forge-runtime/core';

import { hasToolPermission } from '../capabilities/catalog';
import type { createAgentScheduleManager } from './manager';

const manageSelfCronsInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']).describe('The cron operation to perform.'),
  create: z.object({
    name: z.string().describe('Cron name.'),
    description: z.string().optional().describe('Optional note explaining what this cron is for.'),
    scheduleType: z.enum(['cron', 'date']).describe('Use the literal string cron for recurring execution or date for one-time execution.'),
    cronExpression: z.string().optional().describe('Required when scheduleType is cron. Example: 0 * * * *.'),
    scheduledDate: z.string().optional().describe('Required when scheduleType is date. Use an ISO string.'),
    timezone: z.string().optional().describe('Optional timezone. If omitted, UTC is used.'),
    content: z.string().describe('The message or task content that should be delivered when the cron runs.'),
    wakeWhenRunning: z.boolean().optional().describe('Only for recurring crons. If false, this cron behaves like heartbeat and only wakes you when you are idle.'),
  }).optional().describe('Provide this object only when action is create.'),
  update: z.object({
    cronId: z.string().describe('Required cron id to update.'),
    name: z.string().optional().describe('New cron name.'),
    description: z.string().optional().describe('Optional new note.'),
    scheduleType: z.enum(['cron', 'date']).optional().describe('Optional new schedule type.'),
    cronExpression: z.string().optional().describe('Optional new cron expression.'),
    scheduledDate: z.string().optional().describe('Optional new one-time execution date.'),
    timezone: z.string().optional().describe('Optional new timezone.'),
    content: z.string().optional().describe('Optional new content.'),
    wakeWhenRunning: z.boolean().optional().describe('Only for recurring crons. If false, this cron only wakes you when you are idle.'),
    isActive: z.boolean().optional().describe('Optional active flag.'),
  }).optional().describe('Provide this object only when action is update.'),
  delete: z.object({
    cronId: z.string().describe('Required cron id to delete.'),
  }).optional().describe('Provide this object only when action is delete.'),
});

const manageCronsInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']).describe('The delegated cron operation to perform.'),
  create: z.object({
    targetAgentId: z.string().describe('Required target agent id for delegated cron creation.'),
    name: z.string().describe('Cron name.'),
    description: z.string().optional().describe('Optional note explaining what this cron is for.'),
    scheduleType: z.enum(['cron', 'date']).describe('Use the literal string cron for recurring execution or date for one-time execution.'),
    cronExpression: z.string().optional().describe('Required when scheduleType is cron. Example: 0 * * * *.'),
    scheduledDate: z.string().optional().describe('Required when scheduleType is date. Use an ISO string.'),
    timezone: z.string().optional().describe('Optional timezone. If omitted, UTC is used.'),
    content: z.string().describe('The message or task content that should be delivered when the cron runs.'),
    wakeWhenRunning: z.boolean().optional().describe('Only for recurring crons. If false, this delegated cron only wakes the target when the target is idle.'),
  }).optional().describe('Provide this object only when action is create.'),
  update: z.object({
    cronId: z.string().describe('Required delegated cron id to update.'),
    name: z.string().optional().describe('New cron name.'),
    description: z.string().optional().describe('Optional new note.'),
    scheduleType: z.enum(['cron', 'date']).optional().describe('Optional new schedule type.'),
    cronExpression: z.string().optional().describe('Optional new cron expression.'),
    scheduledDate: z.string().optional().describe('Optional new one-time execution date.'),
    timezone: z.string().optional().describe('Optional new timezone.'),
    content: z.string().optional().describe('Optional new content.'),
    wakeWhenRunning: z.boolean().optional().describe('Only for recurring crons. If false, this delegated cron only wakes the target when the target is idle.'),
    isActive: z.boolean().optional().describe('Optional active flag.'),
  }).optional().describe('Provide this object only when action is update.'),
  delete: z.object({
    cronId: z.string().describe('Required delegated cron id to delete.'),
  }).optional().describe('Provide this object only when action is delete.'),
});

function validateCreateTiming(input: {
  name?: string | null;
  scheduleType: 'cron' | 'date' | null | undefined;
  cronExpression?: string | null;
  scheduledDate?: string | null;
  content?: string | null;
}) {
  if ((input.name ?? '') === '') {
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

  if (input.scheduleType === 'cron' && (input.cronExpression ?? '') === '') {
    return {
      valid: false as const,
      error: 'cronExpression is required when scheduleType is cron',
      hint: 'For recurring crons, send cronExpression with a real value such as "0 * * * *".',
    };
  }

  if (input.scheduleType === 'date' && (input.scheduledDate ?? 0) === 0) {
    return {
      valid: false as const,
      error: 'scheduledDate is required when scheduleType is date',
      hint: 'Provide an ISO date string for one-time crons.',
    };
  }

  if ((input.content ?? '') === '') {
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

  if (cronId !== undefined && cronId !== null && cronId !== '') {
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

  if (cronId !== undefined && cronId !== null && cronId !== '') {
    return cronId;
  }

  const delegatedCrons = await schedules.listTasks(creatorAgentId, input.targetAgentId ?? undefined);

  if (delegatedCrons.length === 1) {
    return delegatedCrons[0].scheduleId;
  }

  return null;
}

function validateDelegatedCronCreateTarget(input: { targetAgentId?: string }) {
  if (input.targetAgentId !== undefined && input.targetAgentId !== '') {
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
  const { scheduleId: _scheduleId, taskId: _taskId, ...base } = value;

  return {
    ...base,
    cronId,
  };
}

export function createAgentScheduleTools(
  agentId: string,
  schedules: ReturnType<typeof createAgentScheduleManager>,
  allowedToolIds?: Set<string> | null,
) {
  const tools: Record<string, ReturnType<typeof createTool>> = {};

  tools.list_self_crons = createTool({
    id: 'list_self_crons',
    description: 'List all crons that belong to you. This includes crons you created yourself and crons created for you by other agents. Use this to understand your scheduled work and get the cronId for any cron you are allowed to inspect.',
    inputSchema: z.object({}),
    execute: async () => {
      forgeDebug({ scope: 'tools:schedules', level: 'info', message: 'list_self_crons called', context: { agentId } });
      try {
        const result = await schedules.listSchedules(agentId);
        forgeDebug({ scope: 'tools:schedules', level: 'info', message: 'list_self_crons result', context: { count: result.length } });
        return result.map(toCronOutput);
      } catch (error) {
        forgeDebug({ scope: 'tools:schedules', level: 'error', message: 'list_self_crons failed: ' + (error instanceof Error ? error.message : String(error)) });
        return {
          valid: false,
          error: error instanceof Error ? error.message : String(error),
          hint: 'Try again in a moment. If the problem persists, verify the cron store is available.',
        };
      }
    },
  });

  if (hasToolPermission(allowedToolIds, 'manage_self_crons')) {
    tools.manage_self_crons = createTool({
      id: 'manage_self_crons',
      description: 'Use this to create, update, or delete automatic tasks for yourself. Do not rely on your own memory to remember future work. Use crons proactively to trigger your future and recurring work dynamically, and prefer simple, directed tasks.',
      inputSchema: manageSelfCronsInputSchema,
      execute: async (input) => {
        forgeDebug({ scope: 'tools:schedules', level: 'info', message: 'manage_self_crons called', context: { agentId, action: input.action, input } });

        if (input.action === 'create') {
          const createInput = input.action === 'create' ? input.create ?? null : null;

          if (!createInput) {
            return {
              valid: false,
              error: 'create is required when action is create',
              hint: 'Send the create object with name, scheduleType, and content.',
            };
          }

          const validation = validateCreateTiming(createInput);

          if (validation) {
            return validation;
          }

          try {
            const result = createInput.scheduleType === 'cron'
              ? await schedules.createSchedule(agentId, {
                  name: createInput.name,
                  description: normalizeOptionalText(createInput.description ?? undefined),
                  scheduleType: 'cron',
                  cronExpression: createInput.cronExpression ?? '',
                  timezone: createInput.timezone ?? 'UTC',
                  content: createInput.content,
                  wakeWhenRunning: createInput.wakeWhenRunning ?? true,
                })
              : await schedules.createSchedule(agentId, {
                  name: createInput.name,
                  description: normalizeOptionalText(createInput.description ?? undefined),
                  scheduleType: 'date',
                  scheduledDate: createInput.scheduledDate ?? '',
                  timezone: createInput.timezone ?? 'UTC',
                  content: createInput.content,
                });

            return {
              valid: true,
              ...toCronOutput(result),
            };
          } catch (error) {
            forgeDebug({ scope: 'tools:schedules', level: 'error', message: 'manage_self_crons action=create failed: ' + (error instanceof Error ? error.message : String(error)) });
            return {
              valid: false,
              error: error instanceof Error ? error.message : String(error),
              hint: 'Review the cron fields and try again. Use cron for recurring execution or date for one-time execution.',
            };
          }
        }

        if (input.action === 'update') {
          const updateInput = input.action === 'update' ? input.update ?? null : null;

          if (!updateInput) {
            return {
              valid: false,
              error: 'update is required when action is update',
              hint: 'Send the update object with cronId and the fields you want to change.',
            };
          }

          const cronId = await resolveSelfCronId(updateInput, agentId, schedules);

          if (cronId === null || cronId === undefined) {
            return {
              valid: false as const,
              error: 'cronId is required for update and delete',
              hint: 'Use list_self_crons to get the cronId. If you only have one cron, the tool can resolve it automatically.',
            };
          }

          try {
            const result = await schedules.updateSchedule(agentId, cronId, {
              name: normalizeOptionalText(updateInput.name ?? undefined),
              description: normalizeOptionalText(updateInput.description ?? undefined),
              scheduleType: updateInput.scheduleType ?? undefined,
              cronExpression: normalizeOptionalText(updateInput.cronExpression ?? undefined),
              scheduledDate: normalizeOptionalText(updateInput.scheduledDate ?? undefined),
              timezone: normalizeOptionalText(updateInput.timezone ?? undefined),
              content: normalizeOptionalText(updateInput.content ?? undefined),
              wakeWhenRunning: updateInput.wakeWhenRunning ?? undefined,
              isActive: updateInput.isActive ?? undefined,
            });

            return {
              valid: true,
              ...toCronOutput(result),
            };
          } catch (error) {
            forgeDebug({ scope: 'tools:schedules', level: 'error', message: 'manage_self_crons action=update failed: ' + (error instanceof Error ? error.message : String(error)), context: { error: error instanceof Error ? error.message : String(error) } });
            return {
              valid: false,
              error: error instanceof Error ? error.message : String(error),
              hint: 'Use list_self_crons to confirm the cronId is correct and belongs to this agent.',
            };
          }
        }

        const deleteInput = input.action === 'delete' ? input.delete ?? null : null;

        if (!deleteInput) {
          return {
            valid: false,
            error: 'delete is required when action is delete',
            hint: 'Send the delete object with cronId.',
          };
        }

        const cronId = await resolveSelfCronId(deleteInput, agentId, schedules);

        if (cronId === null || cronId === undefined) {
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
          forgeDebug({ scope: 'tools:schedules', level: 'error', message: 'manage_self_crons action=update failed: ' + (error instanceof Error ? error.message : String(error)), context: { error: error instanceof Error ? error.message : String(error) } });
          return {
            valid: false,
            error: error instanceof Error ? error.message : String(error),
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
        targetAgentId: z.string().min(1).optional().describe('Optional target agent id if you want to see only crons aimed at one specific agent.'),
      }),
      execute: async (input) => {
        forgeDebug({ scope: 'tools:schedules', level: 'info', message: 'list_crons called', context: { agentId, targetAgentId: input.targetAgentId } });
        try {
          const result = await schedules.listTasks(agentId, input.targetAgentId ?? undefined);
          forgeDebug({ scope: 'tools:schedules', level: 'info', message: 'list_crons result', context: { count: result.length } });
          return result.map(toCronOutput);
        } catch (error) {
          forgeDebug({ scope: 'tools:schedules', level: 'error', message: 'list_crons failed: ' + (error instanceof Error ? error.message : String(error)), context: { error: error instanceof Error ? error.message : String(error) } });
          return {
            valid: false,
            error: error instanceof Error ? error.message : String(error),
            hint: 'Try again in a moment. If the problem persists, verify the delegated cron store is available.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_crons')) {
    tools.manage_crons = createTool({
      id: 'manage_crons',
      description: 'Use this to create, update, or delete automatic tasks for other agents. Use delegated crons proactively when another agent should receive future or recurring work without relying on someone to remember manually. Prefer simple, directed tasks.',
      inputSchema: manageCronsInputSchema,
      execute: async (input) => {
        forgeDebug({ scope: 'tools:schedules', level: 'info', message: 'manage_crons called', context: { agentId, action: input.action, input } });

        if (input.action === 'create') {
          const createInput = input.action === 'create' ? input.create ?? null : null;

          if (!createInput) {
            return {
              valid: false,
              error: 'create is required when action is create',
              hint: 'Send the create object with targetAgentId, name, scheduleType, and content.',
            };
          }

          const createTargetValidation = validateDelegatedCronCreateTarget(createInput);

          if (createTargetValidation) {
            return createTargetValidation;
          }

          const validation = validateCreateTiming(createInput);

          if (validation) {
            return validation;
          }

          try {
            const result = createInput.scheduleType === 'cron'
              ? await schedules.createScheduleForAgent(agentId, {
                  targetAgentId: createInput.targetAgentId,
                  name: createInput.name,
                  description: normalizeOptionalText(createInput.description ?? undefined),
                  scheduleType: 'cron',
                  cronExpression: createInput.cronExpression ?? '',
                  timezone: createInput.timezone ?? 'UTC',
                  content: createInput.content,
                  wakeWhenRunning: createInput.wakeWhenRunning ?? true,
                })
              : await schedules.createScheduleForAgent(agentId, {
                  targetAgentId: createInput.targetAgentId,
                  name: createInput.name,
                  description: normalizeOptionalText(createInput.description ?? undefined),
                  scheduleType: 'date',
                  scheduledDate: createInput.scheduledDate ?? '',
                  timezone: createInput.timezone ?? 'UTC',
                  content: createInput.content,
                });

            return {
              valid: true,
              ...toCronOutput(result),
            };
          } catch (error) {
            forgeDebug({ scope: 'tools:schedules', level: 'error', message: 'manage_crons action=create failed: ' + (error instanceof Error ? error.message : String(error)), context: { error: error instanceof Error ? error.message : String(error) } });
            return {
              valid: false,
              error: error instanceof Error ? error.message : String(error),
              hint: 'Verify the targetAgentId exists and that you have permission to create delegated crons.',
            };
          }
        }

        if (input.action === 'update') {
          const updateInput = input.action === 'update' ? input.update ?? null : null;

          if (!updateInput) {
            return {
              valid: false,
              error: 'update is required when action is update',
              hint: 'Send the update object with cronId and the fields you want to change.',
            };
          }

          const cronId = await resolveDelegatedCronId(updateInput, agentId, schedules);

          if (cronId === null || cronId === undefined) {
            return {
              valid: false as const,
              error: 'cronId is required for update and delete',
              hint: 'Use list_crons to get the cronId. If there is only one matching delegated cron, the tool can resolve it automatically.',
            };
          }

          try {
            const result = await schedules.editCron(agentId, cronId, {
              name: normalizeOptionalText(updateInput.name ?? undefined),
              description: normalizeOptionalText(updateInput.description ?? undefined),
              scheduleType: updateInput.scheduleType ?? undefined,
              cronExpression: normalizeOptionalText(updateInput.cronExpression ?? undefined),
              scheduledDate: normalizeOptionalText(updateInput.scheduledDate ?? undefined),
              timezone: normalizeOptionalText(updateInput.timezone ?? undefined),
              content: normalizeOptionalText(updateInput.content ?? undefined),
              wakeWhenRunning: updateInput.wakeWhenRunning ?? undefined,
              isActive: updateInput.isActive ?? undefined,
            });

            return {
              valid: true,
              ...toCronOutput(result),
            };
          } catch (error) {
            forgeDebug({ scope: 'tools:schedules', level: 'error', message: 'manage_crons action=update failed: ' + (error instanceof Error ? error.message : String(error)), context: { error: error instanceof Error ? error.message : String(error) } });
            return {
              valid: false,
              error: error instanceof Error ? error.message : String(error),
              hint: 'Use list_crons to confirm the cronId is correct and that you created this delegated cron.',
            };
          }
        }

        const deleteInput = input.action === 'delete' ? input.delete ?? null : null;

        if (!deleteInput) {
          return {
            valid: false,
            error: 'delete is required when action is delete',
            hint: 'Send the delete object with cronId.',
          };
        }

        const cronId = await resolveDelegatedCronId(deleteInput, agentId, schedules);

        if (cronId === null || cronId === undefined) {
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
          forgeDebug({ scope: 'tools:schedules', level: 'error', message: 'manage_crons action=update failed: ' + (error instanceof Error ? error.message : String(error)), context: { error: error instanceof Error ? error.message : String(error) } });
          return {
            valid: false,
            error: error instanceof Error ? error.message : String(error),
            hint: 'Use list_crons to confirm the cronId is correct and that you created this delegated cron.',
          };
        }
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
