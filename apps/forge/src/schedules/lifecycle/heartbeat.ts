/**
 * schedules/heartbeat.ts
 *
 * Heartbeat schedule creation.
 * Extracted from manager.ts (#4877) — heartbeat creation concern only.
 *
 * Refactor (Lead 8 #5739 Phase 2): the return type was `Promise<Record<string, unknown>>`
 * (defensive escape hatch that hid the scheduleId alias from the createSchedule return).
 * Narrowed to `Promise<AgentSchedule & { scheduleId: string }>` so callers in manager.ts
 * can access `.scheduleId` and pass to `lifecycle.register()` without
 * `as unknown as StoredSchedule` / `as unknown as ScheduleLifecycleRecord` casts.
 */
import { HEARTBEAT_CRON_EXPRESSION, HEARTBEAT_TIMEZONE, HEARTBEAT_NAME } from './cron';
import type { AgentSchedule } from '../../database/schema';

export type CreateHeartbeatInput = {
  agentId: string;
  store: {
    createSchedule(input: {
      agentId: string;
      kind: 'heartbeat';
      name: string;
      description: null;
      scheduleType: 'cron';
      cronExpression: string;
      scheduledDate: undefined;
      timezone: string;
      content: string;
      wakeWhenRunning: boolean;
    }): Promise<AgentSchedule & { scheduleId: string }>;
  };
};

export function createHeartbeatSchedule(input: CreateHeartbeatInput) {
  return input.store.createSchedule({
    agentId: input.agentId,
    kind: 'heartbeat',
    name: HEARTBEAT_NAME,
    description: null,
    scheduleType: 'cron',
    cronExpression: HEARTBEAT_CRON_EXPRESSION,
    scheduledDate: undefined,
    timezone: HEARTBEAT_TIMEZONE,
    content: '',
    wakeWhenRunning: false,
  });
}
