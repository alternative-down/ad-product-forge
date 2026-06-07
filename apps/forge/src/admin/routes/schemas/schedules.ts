import { z } from 'zod';

/** Fields common to both cron and date schedules for the admin create endpoint. */
const createScheduleBaseFields = {
  agentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
  wakeWhenRunning: z.boolean().optional(),
} as const;

/**
 * Admin route schema for creating a schedule.
 *
 * Discriminated union on `scheduleType`:
 *   - `cron` requires `cronExpression` and rejects `scheduledDate`
 *   - `date` requires `scheduledDate` and rejects `cronExpression`
 *
 * Fixes #5560 — previously a plain `z.object` accepted invalid combinations
 * (e.g. `scheduleType: 'cron'` with `scheduledDate` and no `cronExpression`),
 * which only failed at runtime when consumed by the manager.
 *
 * Mirrors the pattern in `apps/forge/src/schedules/tools/schemas.ts:25`
 * (extracted in #1184) but adds the `agentId` field required by the admin route.
 */
export const createScheduleSchema = z.discriminatedUnion('scheduleType', [
  z.object({
    ...createScheduleBaseFields,
    scheduleType: z.literal('cron'),
    cronExpression: z.string().min(1),
    scheduledDate: z.undefined().optional(),
  }),
  z.object({
    ...createScheduleBaseFields,
    scheduleType: z.literal('date'),
    scheduledDate: z.string().min(1),
    cronExpression: z.undefined().optional(),
  }),
]);

export const updateScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
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

export const deleteScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
});

// =============================================================================
// INTERNAL CHAT SCHEMAS
// =============================================================================
