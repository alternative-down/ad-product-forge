/**
 * schedules/notifications.ts
 *
 * Notification triggering for schedules.
 * Extracted from manager.ts (#4877) — notification triggering concern only.
 */
import type { Database } from '../database/schema';
import { createAgentNotificationStore } from '../notifications/store';
import {
  createNotificationContent,
  createWakeContent,
  createHeartbeatWakeInstruction,
} from './schedule-helpers';

export type NotificationDependencies = {
  db: Database;
  notifyAgent(input: {
    agentId: string;
    scheduleId: string;
    scheduleKind: 'agent' | 'heartbeat';
    scheduleName: string;
    content: string;
    timestamp: number;
    idleOnly?: boolean;
  }): void;
};

export type ScheduleRecordForNotification = {
  scheduleId: string;
  name: string;
  description?: string | null;
  kind: 'agent' | 'heartbeat';
  scheduleType: 'cron' | 'date';
  cronExpression?: string | null;
  scheduledDate?: number | null;
  timezone: string;
  content: string;
  wakeWhenRunning: boolean;
  agentId: string;
};

export function createScheduleNotifications(deps: NotificationDependencies) {
  const notifications = createAgentNotificationStore(deps.db);

  async function triggerNotification(
    scheduleRecord: ScheduleRecordForNotification,
    fireDate: Date,
    nextTriggerAt: number | null = null,
  ): Promise<void> {
    if (scheduleRecord.kind === 'agent') {
      await notifications.createNotification({
        agentId: scheduleRecord.agentId,
        content: createNotificationContent({
          agentId: scheduleRecord.agentId,
          scheduleId: scheduleRecord.scheduleId,
          kind: scheduleRecord.kind,
          description: scheduleRecord.description ?? undefined,
          scheduleType: scheduleRecord.scheduleType,
          cronExpression: scheduleRecord.cronExpression,
          scheduledDate: scheduleRecord.scheduledDate,
          timezone: scheduleRecord.timezone,
          content: scheduleRecord.content,
          fireDate,
        }),
      });
    }

    deps.notifyAgent({
      agentId: scheduleRecord.agentId,
      scheduleId: scheduleRecord.scheduleId,
      scheduleKind: scheduleRecord.kind,
      scheduleName: scheduleRecord.name,
      idleOnly:
        scheduleRecord.kind === 'heartbeat' ||
        (scheduleRecord.scheduleType === 'cron' && scheduleRecord.wakeWhenRunning === false),
      content: createWakeContent({
        name: scheduleRecord.name,
        description: scheduleRecord.description,
        scheduleKind: scheduleRecord.kind,
        scheduleType: scheduleRecord.scheduleType,
        cronExpression: scheduleRecord.cronExpression,
        scheduledDate: scheduleRecord.scheduledDate,
        timezone: scheduleRecord.timezone,
        nextTriggerAt,
        wakeWhenRunning: scheduleRecord.wakeWhenRunning,
        content:
          scheduleRecord.kind === 'agent'
            ? scheduleRecord.content
            : createHeartbeatWakeInstruction(scheduleRecord.content),
      }),
      timestamp: fireDate.getTime(),
    });
  }

  return { triggerNotification };
}