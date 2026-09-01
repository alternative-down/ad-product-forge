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
// ─── Type exports ─────────────────────────────────────────────────────────────

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type CreateScheduleForAgentInput = z.infer<typeof createScheduleForAgentSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
