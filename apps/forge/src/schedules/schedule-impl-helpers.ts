/**
 * Schedule operation helpers for manager.ts
 * Extracted to reduce duplication in createAgentScheduleManager
 */
import { forgeDebug } from '@forge-runtime/core';

import { z } from 'zod';
import { scheduleBaseSchema } from './schemas';


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


// ── Authorization ────────────────────────────────────────────────────────────

/**
 * Checks whether the requesting agent is authorized to edit/delete a schedule.
 * Authorization rules:
 * - creatorId === requester → authorized
 * - creatorId === null AND agentId === requester → authorized (self-created)
 * - otherwise → not authorized
 */
export function isScheduleEditor(schedule: any, requesterAgentId: string): boolean {
  const isCreator = schedule.creatorId === requesterAgentId;
  const isSelfCreated = schedule.creatorId === null && schedule.agentId === requesterAgentId;
  return isCreator || isSelfCreated;
}

/**
 * Validates the caller is authorized to modify the schedule, throws if not.
 */
export function requireScheduleEditor(schedule: any, requesterAgentId: string): void {
  if (!isScheduleEditor(schedule, requesterAgentId)) {
    forgeDebug({
      scope: 'schedule-impl-helpers',
      level: 'warn',
      message: 'checkScheduleAuthorization: not authorized to edit',
      context: { scheduleId: schedule.scheduleId },
    });
    throw new Error(`Not authorized to edit schedule: ${schedule.scheduleId}`);
  }
}

/**
 * Validates the caller is authorized to delete the schedule, throws if not.
 */
export function requireScheduleDeleter(schedule: any, requesterAgentId: string): void {
  if (!isScheduleEditor(schedule, requesterAgentId)) {
    forgeDebug({
      scope: 'schedule-impl-helpers',
      level: 'warn',
      message: 'checkScheduleAuthorization: not authorized to delete',
      context: { scheduleId: schedule.scheduleId },
    });
    throw new Error(`Not authorized to delete schedule: ${schedule.scheduleId}`);
  }
}
