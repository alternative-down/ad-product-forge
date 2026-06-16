export function isActiveSchedule(s: { isActive: boolean | number }): boolean {
  // DB stores isActive as integer 0|1; convert both forms to a real boolean check.
  return s.isActive === true || s.isActive === 1;
}

import { forgeDebug } from '@forge-runtime/core';
import { errorMsg } from '../../agents/error-formatting';
import { z } from 'zod';

import type { Database } from '../../database/client';
import { createAgentScheduleStore, type UpdateAgentScheduleInput, toScheduleRecord } from './store';
import { createScheduleLifecycle, type ScheduleLifecycleRecord } from '../lifecycle/lifecycle';
import {
  parseScheduleDate,
  validateScheduleShape,
  assertFutureScheduledDate,
  toToolOutput,
} from '../notifications/wake-content';
import {
  normalizeScheduleUpdate,
  buildScheduleUpdateInput,
  buildScheduleRollbackInput,
} from './normalize';
import { requireScheduleEditor, requireScheduleDeleter } from './auth';
import { createScheduleSchema,
  createScheduleForAgentSchema,
  updateScheduleSchema,
} from '../tools/schemas';
import { createHeartbeatSchedule as makeHeartbeatSchedule } from '../lifecycle/heartbeat';
import { createScheduleNotifications, type ScheduleRecordForNotification } from '../notifications/notifications';

export type AgentScheduleManager = ReturnType<typeof createAgentScheduleManager>;

export function createAgentScheduleManager(input: {
  db: Database;
  /** Injected lifecycle for testability. */
  lifecycle?: ReturnType<typeof createScheduleLifecycle>;
  getAgentPendingSummary?(agentId: string): Promise<{
    unreadNotificationCount: number;
    unreadConversationCount: number;
    unreadMessageCount: number;
  }>;
  getAgentExecutionState?(agentId: string): Promise<'idle' | 'running' | 'absent'>;
  notifyAgent(input: {
    agentId: string;
    scheduleId: string;
    scheduleKind: 'agent' | 'heartbeat';
    scheduleName: string;
    content: string;
    timestamp: number;
    idleOnly?: boolean;
  }): void;
}) {
  const store = createAgentScheduleStore(input.db);
  let lifecycle: ReturnType<typeof createScheduleLifecycle> | null = null;

  const { triggerNotification } = createScheduleNotifications({
    db: input.db,
    notifyAgent: input.notifyAgent,
  });

  const getLifecycle = (): ReturnType<typeof createScheduleLifecycle> => {
    if (input.lifecycle) {
      if (!lifecycle) lifecycle = input.lifecycle;
      return lifecycle;
    }
    if (!lifecycle) {
      lifecycle = createScheduleLifecycle({
        db: input.db,
        onFire: async (record, fireDate) => {
          await triggerSchedule(record, fireDate, true);
        },
      });
    }
    return lifecycle;
  };
  type StoredSchedule = NonNullable<Awaited<ReturnType<typeof store.getScheduleByKind>>>;

  async function getAgentSchedule(agentId: string, scheduleId: string) {
    try {
      return await store.getAgentSchedule(agentId, scheduleId);
    } catch (error) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'getAgentSchedule failed',
        context: { agentId, scheduleId, error: errorMsg(error) },
      });
      throw error;
    }
  }

  async function loadAll() {
    if (!lifecycle) return;
    await lifecycle.loadAll();
  }

  async function createHeartbeatSchedule(agentId: string) {
    const record = await makeHeartbeatSchedule({
      agentId,
      store,
    });
    try {
      await getLifecycle().register(toScheduleRecord(record));
    } catch (error) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'createHeartbeatSchedule: registerSchedule failed',
        context: {
          agentId,
          scheduleId: record.scheduleId,
          error: errorMsg(error),
        },
      });
      throw error;
    }
    return {
      scheduleId: record.scheduleId,
    };
  }
  async function createSchedule(agentId: string, rawInput: z.input<typeof createScheduleSchema>) {
    const parsed = createScheduleSchema.parse(rawInput);
    const scheduledDate =
      parsed.scheduledDate !== undefined ? parseScheduleDate(parsed.scheduledDate) : undefined;
    validateScheduleShape({
      scheduleType: parsed.scheduleType,
      cronExpression: parsed.cronExpression,
      scheduledDate,
    });
    assertFutureScheduledDate(parsed.scheduleType, scheduledDate);
    const record = await store.createSchedule({
      agentId,
      kind: 'agent',
      name: parsed.name,
      description: parsed.description,
      scheduleType: parsed.scheduleType,
      cronExpression: parsed.cronExpression,
      scheduledDate,
      timezone: parsed.timezone,
      content: parsed.content,
      wakeWhenRunning: parsed.scheduleType === 'cron' ? parsed.wakeWhenRunning !== false : true,
    });
    try {
      await getLifecycle().register(toScheduleRecord(record));
    } catch (error) {
      await store.deleteAgentSchedule(agentId, record.id);
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'createSchedule: registerSchedule failed, cleaned up record',
        context: { agentId, error: errorMsg(error) },
      });
      throw error;
    }

    return toToolOutput(toScheduleRecord(record));
  }

  async function listSchedules(agentId: string) {
    try {
      const schedules = await store.listAgentSchedules(agentId);
      return schedules.map(toToolOutput);
    } catch (error) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'listSchedules failed',
        context: { error: errorMsg(error) },
      });
      throw error;
    }
  }

  async function listTasks(creatorAgentId: string, targetAgentId?: string) {
    try {
      const schedules = await store.listCreatedAgentSchedules(creatorAgentId, targetAgentId);
      return schedules.map((schedule) => ({
        ...toToolOutput(schedule),
        createdBy: creatorAgentId,
        targetAgentId: schedule.agentId,
        taskId: schedule.scheduleId,
      }));
    } catch (error) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'listTasks failed',
        context: { error: errorMsg(error) },
      });
      throw error;
    }
  }

  async function updateSchedule(
    agentId: string,
    scheduleId: string,
    rawInput: z.input<typeof updateScheduleSchema>,
  ) {
    const parsed = updateScheduleSchema.parse(rawInput);
    const existing = await store.getAgentSchedule(agentId, scheduleId);

    if (existing === null) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'updateSchedule schedule not found',
        context: { agentId, scheduleId },
      });
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const normalized = normalizeScheduleUpdate(
      parsed,
      existing,
      parseScheduleDate,
    );
    const { scheduleType, cronExpression, scheduledDate } = normalized;
    validateScheduleShape({
      scheduleType: scheduleType,
      cronExpression: cronExpression ?? undefined,
      scheduledDate: scheduledDate ?? undefined,
    });
    if (normalized.shouldRequireFutureDate) {
      assertFutureScheduledDate(scheduleType, normalized.parsedScheduledDate);
    }
    const rollbackInput = buildScheduleRollbackInput(
      existing,
    ) as UpdateAgentScheduleInput;
    const updated = await store.updateAgentSchedule(
      agentId,
      scheduleId,
      buildScheduleUpdateInput(parsed, {
        scheduleType: normalized.scheduleType,
        cronExpression: normalized.cronExpression ?? null,
        scheduledDate: normalized.scheduledDate,
        wakeWhenRunning: normalized.wakeWhenRunning,
      }) as UpdateAgentScheduleInput,
    );

    if (updated === null) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'updateSchedule schedule not found',
        context: { agentId, scheduleId },
      });
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    getLifecycle().cancel(scheduleId);

    try {
      if (updated !== null && isActiveSchedule(updated) === true) {
        await getLifecycle().register(toScheduleRecord(updated));
      } else {
        await store.setNextTriggerAt(scheduleId, null);
      }
    } catch (error) {
      const restored = await store.updateAgentSchedule(agentId, scheduleId, rollbackInput);
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'updateSchedule: update failed, rolled back',
        context: { agentId, scheduleId, error: errorMsg(error) },
      });

      // Cancel any residual registered entry so the old schedule cannot fire against stale DB state
      getLifecycle().cancel(scheduleId);

      if (
        existing !== null &&
        restored !== null &&
        isActiveSchedule(existing) === true &&
        isActiveSchedule(restored) === true
      ) {
        await getLifecycle().register(toScheduleRecord(restored));
      }

      throw error;
    }

    const reloaded = await store.getAgentSchedule(agentId, scheduleId);

    if (reloaded === null) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'updateSchedule: not found after update',
        context: { scheduleId },
      });
      throw new Error(`Schedule not found after update: ${scheduleId}`);
    }

    return toToolOutput(reloaded);
  }

  async function updateOwnedSchedule(
    agentId: string,
    scheduleId: string,
    rawInput: z.input<typeof updateScheduleSchema>,
  ) {
    const parsed = updateScheduleSchema.parse(rawInput);
    const existing = await store.getAgentSchedule(agentId, scheduleId);

    if (existing === null) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const normalized = normalizeScheduleUpdate(
      parsed,
      existing,
      parseScheduleDate,
    );
    const { scheduleType, cronExpression, scheduledDate } = normalized;
    validateScheduleShape({
      scheduleType: scheduleType,
      cronExpression: cronExpression ?? undefined,
      scheduledDate: scheduledDate ?? undefined,
    });
    if (normalized.shouldRequireFutureDate) {
      assertFutureScheduledDate(scheduleType, normalized.parsedScheduledDate);
    }
    const rollbackInput = buildScheduleRollbackInput(
      existing,
    ) as UpdateAgentScheduleInput;
    const updated = await store.updateAgentSchedule(
      agentId,
      scheduleId,
      buildScheduleUpdateInput(parsed, {
        scheduleType: normalized.scheduleType,
        cronExpression: normalized.cronExpression ?? null,
        scheduledDate: normalized.scheduledDate,
        wakeWhenRunning: normalized.wakeWhenRunning,
      }) as UpdateAgentScheduleInput,
    );

    if (updated === null) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    getLifecycle().cancel(scheduleId);

    try {
      if (updated !== null && isActiveSchedule(updated) === true) {
        await getLifecycle().register(toScheduleRecord(updated));
      } else {
        await store.setNextTriggerAt(scheduleId, null);
      }
    } catch (error) {
      // DB update succeeded but scheduler registration failed — rollback DB state
      const restored = await store.updateAgentSchedule(agentId, scheduleId, rollbackInput);
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'updateOwnedSchedule: scheduler registration failed, DB rolled back',
        context: { agentId, scheduleId, error: errorMsg(error) },
      });

      // Cancel any residual registered entry so the old schedule cannot fire against stale DB state
      getLifecycle().cancel(scheduleId);

      if (
        existing !== null &&
        restored !== null &&
        isActiveSchedule(existing) === true &&
        isActiveSchedule(restored) === true
      ) {
        await getLifecycle().register(toScheduleRecord(restored));
      }

      throw error;
    }

    const reloaded = await store.getAgentSchedule(agentId, scheduleId);

    if (reloaded === null) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'updateOwnedSchedule: not found after update',
        context: { scheduleId },
      });
      throw new Error(`Schedule not found after update: ${scheduleId}`);
    }

    return toToolOutput(reloaded);
  }

  async function deleteSchedule(agentId: string, scheduleId: string) {
    try {
      getLifecycle().cancel(scheduleId);
      const deleted = await store.deleteAgentSchedule(agentId, scheduleId);
      if (!deleted) {
        throw new Error(`Schedule not found or not authorized: ${scheduleId}`);
      }
      return { success: true };
    } catch (error) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: `deleteSchedule failed: ${errorMsg(error)}`,
        context: { agentId, scheduleId },
      });
      throw error;
    }
  }

  // Cross-agent: Create schedule for another agent
  // creatorId = agent that created this schedule (for authorization)
  async function createScheduleForAgent(
    creatorAgentId: string,
    rawInput: z.input<typeof createScheduleForAgentSchema>,
  ) {
    const parsed = createScheduleForAgentSchema.parse(rawInput);
    const scheduledDate =
      parsed.scheduledDate !== undefined ? parseScheduleDate(parsed.scheduledDate) : undefined;
    validateScheduleShape({
      scheduleType: parsed.scheduleType,
      cronExpression: parsed.cronExpression,
      scheduledDate,
    });
    assertFutureScheduledDate(parsed.scheduleType, scheduledDate);

    // Create schedule for target agent with creatorId set to calling agent
    const record = await store.createSchedule({
      agentId: parsed.targetAgentId,
      kind: 'agent',
      name: parsed.name,
      description: parsed.description,
      scheduleType: parsed.scheduleType,
      cronExpression: parsed.cronExpression,
      scheduledDate,
      timezone: parsed.timezone,
      content: parsed.content,
      wakeWhenRunning: parsed.scheduleType === 'cron' ? parsed.wakeWhenRunning !== false : true,
      creatorId: creatorAgentId,
    });

    const scheduleRecord = await store.getAgentSchedule(parsed.targetAgentId, record.id);

    if (scheduleRecord === null) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'createScheduleForAgent failed to load schedule',
        context: { agentId: parsed.targetAgentId, recordId: record.id },
      });
      throw new Error(`Failed to load created schedule: ${record.id}`);
    }

    try {
      await getLifecycle().register(scheduleRecord);
    } catch (error) {
      await store.deleteAgentSchedule(parsed.targetAgentId, record.id);
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: 'createScheduleForAgent: registerSchedule failed, cleaned up record',
        context: { agentId: parsed.targetAgentId, error: errorMsg(error) },
      });
      throw error;
    }

    return {
      targetAgentId: parsed.targetAgentId,
      createdBy: creatorAgentId,
      ...toToolOutput(scheduleRecord),
    };
  }

  // Cross-agent: Edit schedule (only creator can edit)
  async function editCron(
    editorAgentId: string,
    scheduleId: string,
    rawInput: z.input<typeof updateScheduleSchema>,
  ) {
    const schedule = await store.getScheduleById(scheduleId);

    if (schedule === null) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    // Authorization: only creator can edit (or null creator = self-created, only agentId can edit)
    requireScheduleEditor(schedule, editorAgentId);

    // Delegate to updateSchedule with the target agent's ID
    return await updateSchedule(schedule.agentId, scheduleId, rawInput);
  }

  // Cross-agent: Delete schedule (only creator can delete)
  async function deleteCron(editorAgentId: string, scheduleId: string) {
    try {
      const schedule = await store.getScheduleById(scheduleId);

      if (schedule === null) {
        throw new Error(`Schedule not found: ${scheduleId}`);
      }

      // Authorization: only creator can delete (or null creator = self-created, only agentId can delete)
      requireScheduleDeleter(schedule, editorAgentId);

      getLifecycle().cancel(scheduleId);
      return {
        success: await store.deleteAgentSchedule(schedule.agentId, scheduleId),
      };
    } catch (error) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: `deleteCron failed: ${errorMsg(error)}`,
        context: { editorAgentId, scheduleId },
      });
      throw error;
    }
  }

  async function removeAgent(agentId: string) {
    const schedules = await store.listAgentSchedules(agentId);

    for (const scheduleRecord of schedules) {
      getLifecycle().cancel(scheduleRecord.scheduleId);
      try {
        await store.deleteAgentSchedule(agentId, scheduleRecord.scheduleId);
      } catch (error) {
        forgeDebug({
          scope: 'schedules-manager',
          level: 'error',
          message: `removeAgent: failed to delete schedule ${scheduleRecord.scheduleId}: ${errorMsg(error)}`,
          context: { agentId, scheduleId: scheduleRecord.scheduleId },
        });
        throw error;
      }
    }

    // Also delete heartbeat schedules for this agent
    try {
      await store.deleteHeartbeatSchedule(agentId);
    } catch (error) {
      forgeDebug({
        scope: 'schedules-manager',
        level: 'error',
        message: `removeAgent: failed to delete heartbeat schedule: ${errorMsg(error)}`,
        context: { agentId },
      });
      throw error;
    }
  }

  async function stop() {
    if (!lifecycle) return;
    await lifecycle.stop();
  }

  async function __registerSchedule(record: StoredSchedule | null) {
    if (record === null) return;
    if (isActiveSchedule(record) !== true) return;

    await getLifecycle().register(record);
  }

  async function triggerSchedule(
    scheduleRecord: ScheduleLifecycleRecord | StoredSchedule,
    fireDate: Date,
    remainsActive: boolean,
    nextTriggerAt: number | null = null,
  ) {
    // Internal cast: scheduleRecord is a structural superset of ScheduleRecordForNotification
    // (both ScheduleLifecycleRecord and StoredSchedule have all the required fields — only
    // the optionality differs). The cast is on the function-internal boundary, not a type lie.
    const notif = scheduleRecord as ScheduleRecordForNotification;
    try {
      if (scheduleRecord.kind === 'heartbeat') {
        const executionState = await (input.getAgentExecutionState?.(scheduleRecord.agentId) ??
          Promise.resolve<'idle' | 'running' | 'absent'>('idle'));

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
    getAgentSchedule,
    loadAll,
    createHeartbeatSchedule,
    createSchedule,
    listSchedules,
    listTasks,
    updateSchedule,
    updateOwnedSchedule,
    deleteSchedule,
    removeAgent,
    stop,
    createScheduleForAgent,
    editCron,
    deleteCron,
  };
}
