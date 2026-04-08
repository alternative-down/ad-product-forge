import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';
import { forgeDebug } from '@mastra-engine/core';

import { hasToolPermission } from '../capabilities/catalog';
import type { createAgentScheduleManager } from './manager';

const manageSelfCronsInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']).describe('The cron operation to perform.'),
  create: z.object({
    name: z.string().min(1).describe('Cron name.'),
    description: z.string().nullish().describe('Optional note explaining what this cron is for.'),
    scheduleType: z.enum(['cron', 'date']).describe('Use the literal string cron for recurring execution or date for one-time execution.'),
    cronExpression: z.string().min(1).nullish().describe('Required when scheduleType is cron. Example: 0 * * * *.'),
    scheduledDate: z.string().min(1).nullish().describe('Required when scheduleType is date. Use an ISO string.'),
    timezone: z.string().min(1).nullish().describe('Optional timezone. If omitted, UTC is used.'),
    content: z.string().min(1).describe('The message or task content that should be delivered when the cron runs.'),
  }).nullish().describe('Provide this object only when action is create.'),
  update: z.object({
    cronId: z.string().min(1).describe('Required cron id to update.'),
    name: z.string().min(1).nullish().describe('New cron name.'),
    description: z.string().nullish().describe('Optional new note.'),
    scheduleType: z.enum(['cron', 'date']).nullish().describe('Optional new schedule type.'),
    cronExpression: z.string().min(1).nullish().describe('Optional new cron expression.'),
    scheduledDate: z.string().min(1).nullish().describe('Optional new one-time execution date.'),
    timezone: z.string().min(1).nullish().describe('Optional new timezone.'),
    content: z.string().min(1).nullish().describe('Optional new content.'),
    isActive: z.boolean().nullish().describe('Optional active flag.'),
  }).nullish().describe('Provide this object only when action is update.'),
  delete: z.object({
    cronId: z.string().min(1).describe('Required cron id to delete.'),
  }).nullish().describe('Provide this object only when action is delete.'),
});

const manageCronsInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']).describe('The delegated cron operation to perform.'),
  create: z.object({
    targetAgentId: z.string().min(1).describe('Required target agent id for delegated cron creation.'),
    name: z.string().min(1).describe('Cron name.'),
    description: z.string().nullish().describe('Optional note explaining what this cron is for.'),
    scheduleType: z.enum(['cron', 'date']).describe('Use the literal string cron for recurring execution or date for one-time execution.'),
    cronExpression: z.string().min(1).nullish().describe('Required when scheduleType is cron. Example: 0 * * * *.'),
    scheduledDate: z.string().min(1).nullish().describe('Required when scheduleType is date. Use an ISO string.'),
    timezone: z.string().min(1).nullish().describe('Optional timezone. If omitted, UTC is used.'),
    content: z.string().min(1).describe('The message or task content that should be delivered when the cron runs.'),
  }).nullish().describe('Provide this object only when action is create.'),
  update: z.object({
    cronId: z.string().min(1).describe('Required delegated cron id to update.'),
    name: z.string().min(1).nullish().describe('New cron name.'),
    description: z.string().nullish().describe('Optional new note.'),
    scheduleType: z.enum(['cron', 'date']).nullish().describe('Optional new schedule type.'),
    cronExpression: z.string().min(1).nullish().describe('Optional new cron expression.'),
    scheduledDate: z.string().min(1).nullish().describe('Optional new one-time execution date.'),
    timezone: z.string().min(1).nullish().describe('Optional new timezone.'),
    content: z.string().min(1).nullish().describe('Optional new content.'),
    isActive: z.boolean().nullish().describe('Optional active flag.'),
  }).nullish().describe('Provide this object only when action is update.'),
  delete: z.object({
    cronId: z.string().min(1).describe('Required delegated cron id to delete.'),
  }).nullish().describe('Provide this object only when action is delete.'),
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

function getSelfCreateInput(input: z.infer<typeof manageSelfCronsInputSchema>) {
  return input.action === 'create' ? input.create ?? null : null;
}

function getSelfUpdateInput(input: z.infer<typeof manageSelfCronsInputSchema>) {
  return input.action === 'update' ? input.update ?? null : null;
}

function getSelfDeleteInput(input: z.infer<typeof manageSelfCronsInputSchema>) {
  return input.action === 'delete' ? input.delete ?? null : null;
}

function getDelegatedCreateInput(input: z.infer<typeof manageCronsInputSchema>) {
  return input.action === 'create' ? input.create ?? null : null;
}

function getDelegatedUpdateInput(input: z.infer<typeof manageCronsInputSchema>) {
  return input.action === 'update' ? input.update ?? null : null;
}

function getDelegatedDeleteInput(input: z.infer<typeof manageCronsInputSchema>) {
  return input.action === 'delete' ? input.delete ?? null : null;
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
        forgeDebug('tools:schedules', 'manage_self_crons called', { agentId, action: input.action });

        if (input.action === 'create') {
          const createInput = getSelfCreateInput(input);

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
                  cronExpression: createInput.cronExpression!,
                  timezone: createInput.timezone ?? 'UTC',
                  content: createInput.content,
                })
              : await schedules.createSchedule(agentId, {
                  name: createInput.name,
                  description: normalizeOptionalText(createInput.description ?? undefined),
                  scheduleType: 'date',
                  scheduledDate: createInput.scheduledDate!,
                  timezone: createInput.timezone ?? 'UTC',
                  content: createInput.content,
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
          const updateInput = getSelfUpdateInput(input);

          if (!updateInput) {
            return {
              valid: false,
              error: 'update is required when action is update',
              hint: 'Send the update object with cronId and the fields you want to change.',
            };
          }
          const cronId = await resolveSelfCronId(updateInput, agentId, schedules);

          if (!cronId) {
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
              isActive: updateInput.isActive ?? undefined,
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

        const deleteInput = getSelfDeleteInput(input);

        if (!deleteInput) {
          return {
            valid: false,
            error: 'delete is required when action is delete',
            hint: 'Send the delete object with cronId.',
          };
        }

        const cronId = await resolveSelfCronId(deleteInput, agentId, schedules);

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
        forgeDebug('tools:schedules', 'manage_crons called', { agentId, action: input.action });

        if (input.action === 'create') {
          const createInput = getDelegatedCreateInput(input);

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
                  cronExpression: createInput.cronExpression!,
                  timezone: createInput.timezone ?? 'UTC',
                  content: createInput.content,
                })
              : await schedules.createScheduleForAgent(agentId, {
                  targetAgentId: createInput.targetAgentId,
                  name: createInput.name,
                  description: normalizeOptionalText(createInput.description ?? undefined),
                  scheduleType: 'date',
                  scheduledDate: createInput.scheduledDate!,
                  timezone: createInput.timezone ?? 'UTC',
                  content: createInput.content,
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
          const updateInput = getDelegatedUpdateInput(input);

          if (!updateInput) {
            return {
              valid: false,
              error: 'update is required when action is update',
              hint: 'Send the update object with cronId and the fields you want to change.',
            };
          }

          const cronId = await resolveDelegatedCronId(updateInput, agentId, schedules);

          if (!cronId) {
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
              isActive: updateInput.isActive ?? undefined,
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

        const deleteInput = getDelegatedDeleteInput(input);

        if (!deleteInput) {
          return {
            valid: false,
            error: 'delete is required when action is delete',
            hint: 'Send the delete object with cronId.',
          };
        }

        const cronId = await resolveDelegatedCronId(deleteInput, agentId, schedules);

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
