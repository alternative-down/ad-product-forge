import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../agents/error-formatting';

import { toScheduleRecord } from './store';
import type { ScheduleRecordForNotification } from '../notifications/notifications';
import type { ScheduleLifecycle } from '../lifecycle/lifecycle';

/**
 * schedules/manager/lifecycle-ops.ts
 *
 * Lifecycle management operations for the agent schedule manager.
 * Extracted from manager.ts (#5737) — lifecycle concern only.
 *
 * Public surface: stop
 * Internal (closure for manager wiring): __registerSchedule, triggerSchedule
 */
type StoredSchedule = ReturnType<typeof toScheduleRecord>;
type ScheduleStore = {
  markTriggered(input: {
    scheduleId: string;
    lastTriggeredAt: number;
    nextTriggerAt: number | null;
    isActive: boolean;
  }): Promise<void>;
};

export type CreateManagerLifecycleOpsInput = {
  store: ScheduleStore;
  getLifecycle: () => ScheduleLifecycle | null;
  isActiveSchedule: (s: StoredSchedule | { isActive: boolean }) => boolean;
  triggerNotification: (
    record: Parameters<ReturnType<typeof import('../notifications/notifications').createScheduleNotifications>['triggerNotification']>[0],
    fireDate: Date,
    nextTriggerAt: number | null,
  ) => Promise<void>;
  input: {
    getAgentExecutionState?(agentId: string): Promise<'idle' | 'running' | 'absent'>;
  };
};

export type ManagerLifecycleOps = {
  stop(): Promise<void>;
  __registerSchedule(record: StoredSchedule | null): Promise<void>;
  triggerSchedule(
    scheduleRecord: StoredSchedule,
    fireDate: Date,
    remainsActive: boolean,
    nextTriggerAt?: number | null,
  ): Promise<void>;
};

export function createManagerLifecycleOps(
  input: CreateManagerLifecycleOpsInput,
): ManagerLifecycleOps {
  const { store, getLifecycle, isActiveSchedule, triggerNotification } = input;

  async function stop() {
    const lifecycle = getLifecycle();
    if (!lifecycle) return;
    await lifecycle.stop();
  }

  async function __registerSchedule(record: StoredSchedule | null) {
    if (record === null || isActiveSchedule(record) !== true) return;

    // #5945: getLifecycle() can return null if the lifecycle has been stopped
    // before this schedule could be registered. Log and skip instead of using
    // `!` non-null assertion (which bypasses the null check).
    const lifecycle = getLifecycle();
    if (lifecycle === null) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'info',
        message: '__registerSchedule: lifecycle is null (stopped), skipping register',
        context: { scheduleId: record.scheduleId },
      });
      return;
    }
    await lifecycle.register(record);
  }

  async function triggerSchedule(
    scheduleRecord: StoredSchedule,
    fireDate: Date,
    remainsActive: boolean,
    nextTriggerAt: number | null = null,
  ) {
    try {
      if (scheduleRecord.kind === 'heartbeat') {
        const executionState = await (input.input.getAgentExecutionState?.(
          scheduleRecord.agentId,
        ) ?? Promise.resolve<'idle' | 'running' | 'absent'>('idle'));

        if (executionState === 'running') {
          await store.markTriggered({
            scheduleId: scheduleRecord.scheduleId,
            lastTriggeredAt: fireDate.getTime(),
            nextTriggerAt,
            isActive: remainsActive,
          });
          return;
        }
      }

      // Internal cast: scheduleRecord is a structural superset of ScheduleRecordForNotification
      // (both ScheduleLifecycleRecord and StoredSchedule have all the required fields — only
      // the optionality differs). The cast is on the function-internal boundary, not a type lie.
      const notif = scheduleRecord as ScheduleRecordForNotification;
      await triggerNotification(notif, fireDate, nextTriggerAt);

      await store.markTriggered({
        scheduleId: scheduleRecord.scheduleId,
        lastTriggeredAt: fireDate.getTime(),
        nextTriggerAt,
        isActive: remainsActive,
      });
    } catch (error) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: '[schedules-manager] triggerSchedule failed',
        context: {
          scheduleId: scheduleRecord.scheduleId,
          kind: scheduleRecord.kind,
          fireDate: fireDate.getTime(),
          error: errorMsg(error),
        },
      });
      throw error;
    }
  }

  return {
    stop,
    __registerSchedule,
    triggerSchedule,
  };
}
