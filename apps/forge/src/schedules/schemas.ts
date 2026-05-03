/**
 * Shared Zod schemas for schedule operations.
 *
 * Extracted from manager.ts and tools.ts (#1184) to eliminate duplication.
 *
 * Two versions of each schema:
 *   - Base (this file): no .describe(), for internal use and manager.ts
 *   - With describe(): for agent tool documentation, used in tools.ts
 */

import { z } from 'zod';

// ─── Base schemas ─────────────────────────────────────────────────────────────

/** Fields common to both cron and date schedules. */
export const scheduleBaseSchema = {
  name: z.string().min(1),
  description: z.string().optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
  wakeWhenRunning: z.boolean().optional(),
} as const;

/** Schema for creating a self-schedule (cron or date). */
export const createScheduleSchema = z.discriminatedUnion('scheduleType', [
  z.object({
    ...scheduleBaseSchema,
    scheduleType: z.literal('cron'),
    cronExpression: z.string().min(1),
    scheduledDate: z.undefined().optional(),
  }),
  z.object({
    ...scheduleBaseSchema,
    scheduleType: z.literal('date'),
    scheduledDate: z.string().min(1),
    cronExpression: z.undefined().optional(),
  }),
]);

/** Schema for creating a schedule for another agent (cross-agent). */
export const createScheduleForAgentSchema = z.discriminatedUnion('scheduleType', [
  z.object({
    ...scheduleBaseSchema,
    targetAgentId: z.string().min(1),
    scheduleType: z.literal('cron'),
    cronExpression: z.string().min(1),
    scheduledDate: z.undefined().optional(),
  }),
  z.object({
    ...scheduleBaseSchema,
    targetAgentId: z.string().min(1),
    scheduleType: z.literal('date'),
    scheduledDate: z.string().min(1),
    cronExpression: z.undefined().optional(),
  }),
]);

/** Schema for updating an existing schedule. */
export const updateScheduleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  scheduleType: z.enum(['cron', 'date']).optional(),
  cronExpression: z.string().min(1).optional().nullable(),
  scheduledDate: z.string().min(1).optional().nullable(),
  timezone: z.string().min(1).optional(),
  content: z.string().optional(),
  wakeWhenRunning: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

/** Schema for deleting a schedule. */
export const deleteScheduleSchema = z.object({
  scheduleId: z.string().min(1),
});

// ─── Tool schemas (with describe() for AI tool documentation) ──────────────────

const baseCreate = scheduleBaseSchema;
const baseUpdate = {
  scheduleId: z.string().describe('Required schedule id to update.'),
  name: z.string().optional().describe('New schedule name.'),
  description: z.string().optional().describe('Optional new note.'),
  scheduleType: z.enum(['cron', 'date']).optional().describe('Optional new schedule type.'),
  cronExpression: z.string().optional().describe('Optional new cron expression.'),
  scheduledDate: z.string().optional().describe('Optional new one-time execution date.'),
  timezone: z.string().optional().describe('Optional new timezone.'),
  content: z.string().optional().describe('Optional new content.'),
  wakeWhenRunning: z.boolean().optional().describe('Only for recurring crons.'),
  isActive: z.boolean().optional().describe('Optional active flag.'),
};

/** Input schema for the self-schedule tool (manageSelfCrons). */
export const manageSelfCronsInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']).describe('The cron operation to perform.'),
  create: z.object({
    ...baseCreate,
    scheduleType: z.enum(['cron', 'date']).describe('Use "cron" for recurring or "date" for one-time.'),
    cronExpression: z.string().optional().describe('Required when scheduleType is cron. Example: 0 * * * *.'),
    scheduledDate: z.string().optional().describe('Required when scheduleType is date. ISO string.'),
    timezone: z.string().optional().describe('Timezone. Defaults to UTC.'),
    content: z.string().describe('The message or task delivered when the cron fires.'),
    wakeWhenRunning: z.boolean().optional().describe('For recurring crons only. If false, only wakes when idle.'),
  }).optional().describe('Provide only when action is create.'),
  update: z.object(baseUpdate).optional().describe('Provide only when action is update.'),
  delete: z.object({ scheduleId: z.string().describe('Required schedule id to delete.') }).optional().describe('Provide only when action is delete.'),
});

/** Input schema for the delegated-schedule tool (manageCrons). */
export const manageCronsInputSchema = z.object({
  action: z.enum(['create', 'update', 'delete']).describe('The delegated cron operation to perform.'),
  create: z.object({
    targetAgentId: z.string().describe('Required target agent id for delegated cron creation.'),
    ...baseCreate,
    scheduleType: z.enum(['cron', 'date']).describe('Use "cron" for recurring or "date" for one-time.'),
    cronExpression: z.string().optional().describe('Required when scheduleType is cron. Example: 0 * * * *.'),
    scheduledDate: z.string().optional().describe('Required when scheduleType is date. ISO string.'),
    timezone: z.string().optional().describe('Timezone. Defaults to UTC.'),
    content: z.string().describe('The message or task delivered when the cron fires.'),
    wakeWhenRunning: z.boolean().optional().describe('For recurring crons only.'),
  }).optional().describe('Provide only when action is create.'),
  update: z.object(baseUpdate).optional().describe('Provide only when action is update.'),
  delete: z.object({ scheduleId: z.string().describe('Required schedule id to delete.') }).optional().describe('Provide only when action is delete.'),
});

// ─── Type exports ─────────────────────────────────────────────────────────────

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type CreateScheduleForAgentInput = z.infer<typeof createScheduleForAgentSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type DeleteScheduleInput = z.infer<typeof deleteScheduleSchema>;
export type ManageSelfCronsInput = z.infer<typeof manageSelfCronsInputSchema>;
export type ManageCronsInput = z.infer<typeof manageCronsInputSchema>;