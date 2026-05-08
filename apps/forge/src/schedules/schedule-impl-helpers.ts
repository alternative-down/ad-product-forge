/**
 * Schedule operation helpers for manager.ts
 * Extracted to reduce duplication in createAgentScheduleManager
 */
import type { AgentScheduleStore } from './store';
import { z } from 'zod';

import type { StoredSchedule } from './store';
import type { Job } from 'node-schedule';
import type { RecurrenceSpecDateRange } from 'node-schedule';


import type {Database} from '../database/schema';
import { parseScheduleDate, validateScheduleShape, assertFutureScheduledDate } from './schedule-helpers';

const scheduleBaseSchema = {
  name: z.string().min(1),
  description: z.string().optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
  wakeWhenRunning: z.boolean().optional(),
} as const;

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

export const updateScheduleSchema = z.discriminatedUnion('scheduleType', [
  z.object({
    ...scheduleBaseSchema,
    scheduleType: z.literal('cron'),
    cronExpression: z.string().min(1).nullable().optional(),
    scheduledDate: z.undefined().optional(),
    isActive: z.boolean().optional(),
  }),
  z.object({
    ...scheduleBaseSchema,
    scheduleType: z.literal('date'),
    scheduledDate: z.string().min(1).nullable().optional(),
    cronExpression: z.undefined().optional(),
    isActive: z.boolean().optional(),
  }),
]);

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

// ── Authorization ────────────────────────────────────────────────────────────

/**
 * Checks whether the requesting agent is authorized to edit/delete a schedule.
 * Authorization rules:
 * - creatorId === requester → authorized
 * - creatorId === null AND agentId === requester → authorized (self-created)
 * - otherwise → not authorized
 */
export function isScheduleEditor(schedule: StoredSchedule, requesterAgentId: string): boolean {
  const isCreator = schedule.creatorId === requesterAgentId;
  const isSelfCreated = schedule.creatorId === null && schedule.agentId === requesterAgentId;
  return isCreator || isSelfCreated;
}

/**
 * Validates the caller is authorized to modify the schedule, throws if not.
 */
export function requireScheduleEditor(schedule: StoredSchedule, requesterAgentId: string): void {
  if (!isScheduleEditor(schedule, requesterAgentId)) {
    forgeDebug({ scope: "schedule-impl-helpers", level: "warn", message: "validateScheduleEdit: caller not authorized to edit schedule", context: { scheduleId: schedule.scheduleId } });
    throw new Error(`Not authorized to edit schedule: ${schedule.scheduleId}`);
  }
}

/**
 * Validates the caller is authorized to delete the schedule, throws if not.
 */
export function requireScheduleDeleter(schedule: StoredSchedule, requesterAgentId: string): void {
  if (!isScheduleEditor(schedule, requesterAgentId)) {
    forgeDebug({ scope: "schedule-impl-helpers", level: "warn", message: "validateScheduleDelete: caller not authorized to delete schedule", context: { scheduleId: schedule.scheduleId } });
    throw new Error(`Not authorized to delete schedule: ${schedule.scheduleId}`);
  }
}
