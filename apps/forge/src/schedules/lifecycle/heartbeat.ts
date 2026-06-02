/**
 * schedules/heartbeat.ts
 *
 * Heartbeat schedule creation.
 * Extracted from manager.ts (#4877) — heartbeat creation concern only.
 */
import { HEARTBEAT_CRON_EXPRESSION, HEARTBEAT_TIMEZONE, HEARTBEAT_NAME } from './cron';

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
    }): Promise<Record<string, unknown>>;
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