import { forgeDebug } from '@forge-runtime/core';
import { scheduleJob, type RecurrenceSpecDateRange } from 'node-schedule';
import { z } from 'zod';


import type {Database} from '../database/schema';
import { createAgentNotificationStore } from '../notifications/store';
import { createAgentScheduleStore } from './store';
import { createScheduleLifecycle } from './schedule-lifecycle';
import {
  parseScheduleDate,
  validateScheduleShape,
  assertFutureScheduledDate,
  createNotificationContent,
  createWakeContent,
  createHeartbeatWakeInstruction,
  toToolOutput,
} from './schedule-helpers';
import { normalizeScheduleUpdate, buildScheduleUpdateInput, buildScheduleRollbackInput } from './schedule-normalize-helpers';
import {
  requireScheduleEditor,
  requireScheduleDeleter,
} from './schedule-impl-helpers';
import {
  createScheduleSchema,
  createScheduleForAgentSchema,
  updateScheduleSchema,
} from './schemas';



const HEARTBEAT_NAME = 'System heartbeat';
const HEARTBEAT_CRON_EXPRESSION = '0 * * * *';
const HEARTBEAT_TIMEZONE = 'UTC';


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
  const notifications = createAgentNotificationStore(input.db);
  let lifecycle: ReturnType<typeof createScheduleLifecycle> | null = null;
  const getLifecycle = (): ReturnType<typeof createScheduleLifecycle> => {
    if (input.lifecycle) {
      if (!lifecycle) lifecycle = input.lifecycle;
      return lifecycle;
    }
    if (!lifecycle) {
      lifecycle = createScheduleLifecycle({
        db: input.db,
        onFire: async (record, fireDate) => {
          await triggerSchedule(record as StoredSchedule, fireDate, true);
        },
      });
    }
    return lifecycle;
  };
  type StoredSchedule = NonNullable<Awaited<ReturnType<typeof store.getScheduleByKind>>>;

  async function getOwnedSchedule(agentId: string, scheduleId: string) {
    try {
      return await store.getOwnedSchedule(agentId, scheduleId);
    } catch (error) {
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'getOwnedSchedule failed', context: { agentId, scheduleId, error: error instanceof Error ? error.message : String(error) }});
      throw error;
    }
  }

    async function loadAll() {
    if (!lifecycle) return;
    await lifecycle.loadAll();
  }


  async function createHeartbeatSchedule(agentId: string) {
    const record = await store.createSchedule({
      agentId,
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
    try {
      await getLifecycle().register(record as any);
    } catch (error) {
      forgeDebug({
        scope: 'schedules',
        level: 'error',
        message: 'createHeartbeatSchedule: registerSchedule failed',
        context: { agentId, scheduleId: record.scheduleId, error: error instanceof Error ? error.message : String(error) },
      });
      throw error;
    }
    return {
      scheduleId: record.scheduleId,
    };
  }
  async function createSchedule(agentId: string, rawInput: z.input<typeof createScheduleSchema>) {
    const parsed = createScheduleSchema.parse(rawInput);
    const scheduledDate = parsed.scheduledDate ? parseScheduleDate(parsed.scheduledDate) : undefined;
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
      await getLifecycle().register(record as any);
    } catch (error) {
      await store.deleteAgentSchedule(agentId, record.id);
      forgeDebug({ scope: 'schedules', level: 'error', message: 'createSchedule: registerSchedule failed, cleaned up record', context: { agentId, error } });
      throw error;
    }

    return toToolOutput(record);
  }

  async function listSchedules(agentId: string) {
    try {
      const schedules = await store.listAgentSchedules(agentId);
      return schedules.map(toToolOutput);
    } catch (error) {
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'listSchedules failed', context: { error: error instanceof Error ? error.message : String(error) }});
      throw error;
    }
  }

  async function listTasks(creatorAgentId: string, targetAgentId?: string) {
    try {
      const schedules = await store.listCreatedAgentSchedules(creatorAgentId, targetAgentId);
      return schedules.map((schedule: object) => ({
        ...toToolOutput(schedule),
        createdBy: creatorAgentId,
        targetAgentId: schedule.agentId,
        taskId: schedule.scheduleId,
      }));
    } catch (error) {
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'listTasks failed', context: { error: error instanceof Error ? error.message : String(error) }});
      throw error;
    }
  }

  async function updateSchedule(agentId: string, scheduleId: string, rawInput: z.input<typeof updateScheduleSchema>) {
    const parsed = updateScheduleSchema.parse(rawInput);
    const existing = await store.getAgentSchedule(agentId, scheduleId);

    if (!existing) {
      forgeDebug({ scope: 'schedules', level: 'error', message: 'updateSchedule schedule not found', context: { agentId, scheduleId } });
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const normalized = normalizeScheduleUpdate(parsed, existing, parseScheduleDate);
    const { scheduleType, cronExpression, scheduledDate } = normalized;
    validateScheduleShape({ scheduleType, cronExpression, scheduledDate });
    if (normalized.shouldRequireFutureDate) {
      assertFutureScheduledDate(scheduleType, normalized.parsedScheduledDate);
    }
    const rollbackInput = buildScheduleRollbackInput(existing);
    const updated = await store.updateAgentSchedule(
      agentId,
      scheduleId,
      buildScheduleUpdateInput(parsed, normalized),
    );

    if (!updated) {
      forgeDebug({ scope: 'schedules', level: 'error', message: 'updateSchedule schedule not found', context: { agentId, scheduleId } });
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    getLifecycle().cancel(scheduleId);

    try {
      if (updated.isActive) {
        await getLifecycle().register(updated as any);
      } else {
        await store.setNextTriggerAt(scheduleId, null);
      }
    } catch (error) {
      const restored = await store.updateAgentSchedule(agentId, scheduleId, rollbackInput);
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'updateSchedule: update failed, rolled back', context: { agentId, scheduleId, error } });

      if (existing.isActive && restored) {
        await getLifecycle().register(restored as any);
      }

      throw error;
    }

    const reloaded = await store.getAgentSchedule(agentId, scheduleId);

    if (!reloaded) {
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'updateSchedule: not found after update', context: { scheduleId } });
      throw new Error(`Schedule not found after update: ${scheduleId}`);
    }

    return toToolOutput(reloaded);
  }

  async function updateOwnedSchedule(agentId: string, scheduleId: string, rawInput: z.input<typeof updateScheduleSchema>) {
    const parsed = updateScheduleSchema.parse(rawInput);
    const existing = await store.getOwnedSchedule(agentId, scheduleId);

    if (!existing) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const normalized = normalizeScheduleUpdate(parsed, existing, parseScheduleDate);
    const { scheduleType, cronExpression, scheduledDate } = normalized;
    validateScheduleShape({ scheduleType, cronExpression, scheduledDate });
    if (normalized.shouldRequireFutureDate) {
      assertFutureScheduledDate(scheduleType, normalized.parsedScheduledDate);
    }
    const rollbackInput = buildScheduleRollbackInput(existing);
    const updated = await store.updateOwnedSchedule(
      agentId,
      scheduleId,
      buildScheduleUpdateInput(parsed, normalized),
    );

    if (!updated) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    getLifecycle().cancel(scheduleId);

    try {
      if (updated.isActive) {
        await getLifecycle().register(updated as any);
      } else {
        await store.setNextTriggerAt(scheduleId, null);
      }
    } catch (error) {
      const restored = await store.updateOwnedSchedule(agentId, scheduleId, rollbackInput);
      forgeDebug({ scope: 'schedules', level: 'error', message: 'updateOwnedSchedule: update failed, rolled back', context: { agentId, scheduleId, error } });

      if (existing.isActive && restored) {
        await getLifecycle().register(restored as any);
      }

      throw error;
    }

    const reloaded = await store.getOwnedSchedule(agentId, scheduleId);

    if (!reloaded) {
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'updateOwnedSchedule: not found after update', context: { scheduleId } });
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
        scope: 'schedules',
        level: 'error',
        message: `deleteSchedule failed: ${error instanceof Error ? error.message : String(error)}`,
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
    const scheduledDate = parsed.scheduledDate ? parseScheduleDate(parsed.scheduledDate) : undefined;
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

    if (!scheduleRecord) {
      forgeDebug({ scope: 'schedules', level: 'error', message: 'createScheduleForAgent failed to load schedule', context: { agentId: parsed.targetAgentId, recordId: record.id } });
      throw new Error(`Failed to load created schedule: ${record.id}`);
    }

    try {
      await getLifecycle().register(scheduleRecord as any);
    } catch (error) {
      await store.deleteAgentSchedule(parsed.targetAgentId, record.id);
      forgeDebug({ scope: 'schedules', level: 'error', message: 'createScheduleForAgent: registerSchedule failed, cleaned up record', context: { agentId: parsed.targetAgentId, error } });
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
    try {
      const schedule = await store.getScheduleById(scheduleId);

      if (!schedule) {
        throw new Error(`Schedule not found: ${scheduleId}`);
      }

      // Authorization: only creator can edit (or null creator = self-created, only agentId can edit)
      requireScheduleEditor(schedule, editorAgentId);

      // Delegate to updateSchedule with the target agent's ID
      return await updateSchedule(schedule.agentId, scheduleId, rawInput);
    } catch (error) {
      // updateSchedule already logs the error; re-throw without duplicate forgeDebug
      throw error;
    }
  }

  // Cross-agent: Delete schedule (only creator can delete)
  async function deleteCron(editorAgentId: string, scheduleId: string) {
    try {
      const schedule = await store.getScheduleById(scheduleId);

      if (!schedule) {
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
        message: `deleteCron failed: ${error instanceof Error ? error.message : String(error)}`,
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
      } catch (err) {
        forgeDebug({
          scope: 'schedules',
          level: 'error',
          message: `removeAgent: failed to delete schedule ${scheduleRecord.scheduleId}: ${err instanceof Error ? err.message : String(err)}`,
          context: { agentId, scheduleId: scheduleRecord.scheduleId },
        });
        throw err;
      }
    }

    // Also delete heartbeat schedules for this agent
    try {
      await store.deleteHeartbeatSchedule(agentId);
    } catch (err) {
      forgeDebug({
        scope: 'schedules',
        level: 'error',
        message: `removeAgent: failed to delete heartbeat schedule: ${err instanceof Error ? err.message : String(err)}`,
        context: { agentId },
      });
      throw err;
    }
  }

    async function stop() {
    if (!lifecycle) return;
    await lifecycle.stop();
  }


  async function registerSchedule(record: StoredSchedule | null) {
    if (!record || !record.isActive) return;
    await getLifecycle().register(record as any);
  }


  async function triggerSchedule(
    scheduleRecord: StoredSchedule,
    fireDate: Date,
    remainsActive: boolean,
    nextTriggerAt: number | null = null,
  ) {
    try {
    // Cancellation handled by schedule-lifecycle
    if (scheduleRecord.kind === 'heartbeat') {
      const executionState =
        await (input.getAgentExecutionState?.(scheduleRecord.agentId) ?? Promise.resolve<'idle' | 'running' | 'absent'>('idle'));

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

    if (scheduleRecord.kind === 'agent') {
      await notifications.createNotification({
        agentId: scheduleRecord.agentId,
        content: createNotificationContent({
          agentId: scheduleRecord.agentId,
          scheduleId: scheduleRecord.scheduleId,
          kind: scheduleRecord.kind,
          description: scheduleRecord.description,
          scheduleType: scheduleRecord.scheduleType,
          cronExpression: scheduleRecord.cronExpression,
          scheduledDate: scheduleRecord.scheduledDate,
          timezone: scheduleRecord.timezone,
          content: scheduleRecord.content,
          fireDate,
        }),
      });
    }

    await store.markTriggered({
      scheduleId: scheduleRecord.scheduleId,
      lastTriggeredAt: fireDate.getTime(),
      nextTriggerAt,
      isActive: remainsActive,
    });

    input.notifyAgent({
      agentId: scheduleRecord.agentId,
      scheduleId: scheduleRecord.scheduleId,
      scheduleKind: scheduleRecord.kind,
      scheduleName: scheduleRecord.name,
      idleOnly: scheduleRecord.kind === 'heartbeat'
        || (scheduleRecord.scheduleType === 'cron' && scheduleRecord.wakeWhenRunning === false),
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
        content: scheduleRecord.kind === 'agent'
          ? scheduleRecord.content
          : createHeartbeatWakeInstruction(scheduleRecord.content),
      }),
      timestamp: fireDate.getTime(),
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
          error: error instanceof Error ? error.message : String(error),
        },
      });
      throw error;
    }
  }





  return {
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
    getOwnedSchedule,
  };
}

