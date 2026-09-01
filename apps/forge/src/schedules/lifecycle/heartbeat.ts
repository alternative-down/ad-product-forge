/**
 * schedules/heartbeat.ts
 *
 * Heartbeat schedule creation.
 * Extracted from manager.ts (#4877) — heartbeat creation concern only.
 *
 * Refactor (Lead 8 #5739 Phase 2): the return type was Promise<Record<string, unknown>>
 * (defensive escape hatch that hid the scheduleId alias from the createSchedule return).
 * Narrowed to Promise<AgentSchedule & { scheduleId: string }> so callers in manager.ts
 * can access .scheduleId and pass to lifecycle.register() without
 * as unknown as StoredSchedule / as unknown as ScheduleLifecycleRecord casts.
 *
 * Refactor (#5574 Phase 3): the input type was duplicated (8 fields hardcoded).
 * Derived from the actual store.createSchedule signature via Parameters<ReturnType<>>.
 * If the store input type changes, heartbeat.ts picks up the change automatically.
 */
import { HEARTBEAT_CRON_EXPRESSION, HEARTBEAT_TIMEZONE, HEARTBEAT_NAME } from './cron';
import type { AgentSchedule } from '../../database/schema';
import type { createAgentScheduleStore } from '../manager/store';

// Derive the store input type from the real signature (regression for #5574).
// If store.createSchedule gains a new required field, heartbeat.ts picks it up
// at compile time. Tripwire: __no-inline-heartbeat-createSchedule-type-tripwire.test.ts
type StoreCreateScheduleInput = Parameters<
  ReturnType<typeof createAgentScheduleStore>['createSchedule']
>[0];

export type CreateHeartbeatInput = {
  agentId: string;
  store: {
    createSchedule(
      input: StoreCreateScheduleInput,
    ): Promise<AgentSchedule & { scheduleId: string }>;
  };
};

export function createHeartbeatSchedule(input: CreateHeartbeatInput) {
  return input.store.createSchedule({
    agentId: input.agentId,
    kind: 'heartbeat',
    name: HEARTBEAT_NAME,
    scheduleType: 'cron',
    cronExpression: HEARTBEAT_CRON_EXPRESSION,
    timezone: HEARTBEAT_TIMEZONE,
    content: '',
  });
}
