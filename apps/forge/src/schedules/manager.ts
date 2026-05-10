import { forgeDebug } from '@forge-runtime/core';
import { gracefulShutdown, scheduleJob, cancelJob as cancelScheduledJob, type Job, type RecurrenceSpecDateRange } from 'node-schedule';
import cronParser from 'cron-parser';
import { z } from 'zod';


import type {Database} from '../database/schema';
import { createAgentNotificationStore } from '../notifications/store';
import { createAgentScheduleStore } from './store';
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
  const jobs = new Map<string, Job>();
  type StoredSchedule = NonNullable<Awaited<ReturnType<typeof store.getScheduleByKind>>>;

  async function getOwnedSchedule(agentId: string, scheduleId: string) {
    return store.getOwnedSchedule(agentId, scheduleId);
  }

  async function loadAll() {
    try {
      const schedules = await store.listActiveSchedules();

      for (const scheduleRecord of schedules) {
        cancelScheduledJob(scheduleRecord.scheduleId);
        await registerSchedule(scheduleRecord);
      }
    } catch (error) {
      forgeDebug({
        scope: 'schedules',
        level: 'error',
        message: `loadAll failed: ${error instanceof Error ? error.message : String(error)}`,
        context: {},
      });
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'schedules-manager: operation failed', error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
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
    const heartbeat = await store.getScheduleByKind(agentId, 'heartbeat');

    if (!heartbeat) {
      forgeDebug({ scope: 'schedules', level: 'error', message: 'createHeartbeatSchedule failed to load heartbeat', context: { agentId } });
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'createHeartbeatSchedule: failed to load heartbeat', context: { recordId: record.id } });
      throw new Error(`Failed to load heartbeat schedule: ${record.id}`);
    }

    await registerSchedule(heartbeat);
    return {
      scheduleId: heartbeat.scheduleId,
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
    const scheduleRecord = await store.getAgentSchedule(agentId, record.id);

    if (!scheduleRecord) {
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'createSchedule: failed to load created schedule', context: { recordId: record.id } });
      throw new Error(`Failed to load created schedule: ${record.id}`);
    }

    try {
      await registerSchedule(scheduleRecord);
    } catch (error) {
      await store.deleteAgentSchedule(agentId, record.id);
      forgeDebug({ scope: 'schedules', level: 'error', message: 'createSchedule: registerSchedule failed, cleaned up record', context: { agentId, error } });
      throw error;
    }

    return toToolOutput(scheduleRecord);
  }

  async function listSchedules(agentId: string) {
    const schedules = await store.listAgentSchedules(agentId);
    return schedules.map(toToolOutput);
  }

  async function listTasks(creatorAgentId: string, targetAgentId?: string) {
    const schedules = await store.listCreatedAgentSchedules(creatorAgentId, targetAgentId);
    return schedules.map((schedule) => ({
      ...toToolOutput(schedule),
      createdBy: creatorAgentId,
      targetAgentId: schedule.agentId,
      taskId: schedule.scheduleId,
    }));
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

    cancelScheduledJob(scheduleId);

    try {
      if (updated.isActive) {
        await registerSchedule(updated);
      } else {
        await store.setNextTriggerAt(scheduleId, null);
      }
    } catch (error) {
      const restored = await store.updateAgentSchedule(agentId, scheduleId, rollbackInput);
      forgeDebug({ scope: 'schedules', level: 'error', message: 'cancelAgentSchedule: update failed, rolled back', context: { agentId, scheduleId, error } });

      if (existing.isActive && restored) {
        await registerSchedule(restored);
      }

      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'schedules-manager: operation failed', error: error instanceof Error ? error.message : String(error) });
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

    cancelScheduledJob(scheduleId);

    try {
      if (updated.isActive) {
        await registerSchedule(updated);
      } else {
        await store.setNextTriggerAt(scheduleId, null);
      }
    } catch (error) {
      const restored = await store.updateOwnedSchedule(agentId, scheduleId, rollbackInput);
      forgeDebug({ scope: 'schedules', level: 'error', message: 'updateOwnedSchedule: update failed, rolled back', context: { agentId, scheduleId, error } });

      if (existing.isActive && restored) {
        await registerSchedule(restored);
      }

      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'schedules-manager: operation failed', error: error instanceof Error ? error.message : String(error) });
      throw error;
    }

    const reloaded = await store.getOwnedSchedule(agentId, scheduleId);

    if (!reloaded) {
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'updateSchedule: not found after update', context: { scheduleId } });
      throw new Error(`Schedule not found after update: ${scheduleId}`);
    }

    return toToolOutput(reloaded);
  }

  async function deleteSchedule(agentId: string, scheduleId: string) {
    try {
      cancelScheduledJob(scheduleId);
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
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'schedules-manager: operation failed', error: error instanceof Error ? error.message : String(error) });
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
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'createSchedule: failed to load created schedule', context: { recordId: record.id } });
      throw new Error(`Failed to load created schedule: ${record.id}`);
    }

    try {
      await registerSchedule(scheduleRecord);
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
    const schedule = await store.getScheduleById(scheduleId);

    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    // Authorization: only creator can edit (or null creator = self-created, only agentId can edit)
    requireScheduleEditor(schedule, editorAgentId);

    // Delegate to updateSchedule with the target agent's ID
    return updateSchedule(schedule.agentId, scheduleId, rawInput);
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

      cancelScheduledJob(scheduleId);
      return {
        success: await store.deleteAgentSchedule(schedule.agentId, scheduleId),
      };
    } catch (error) {
      forgeDebug({
        scope: 'schedules',
        level: 'error',
        message: `deleteCron failed: ${error instanceof Error ? error.message : String(error)}`,
        context: { editorAgentId, scheduleId },
      });
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'schedules-manager: operation failed', error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async function removeAgent(agentId: string) {
    const schedules = await store.listAgentSchedules(agentId);

    for (const scheduleRecord of schedules) {
      cancelScheduledJob(scheduleRecord.scheduleId);
      try {
        await store.deleteAgentSchedule(agentId, scheduleRecord.scheduleId);
      } catch (err) {
        forgeDebug({
          scope: 'schedules',
          level: 'error',
          message: `removeAgent: failed to delete schedule ${scheduleRecord.scheduleId}: ${error instanceof Error ? error.message : String(error)}`,
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
        message: `removeAgent: failed to delete heartbeat schedule: ${error instanceof Error ? error.message : String(error)}`,
        context: { agentId },
      });
      throw err;
    }
  }

  async function stop() {
    try {
      for (const [scheduleId, job] of jobs) {
        job.cancel();
        jobs.delete(scheduleId);
      }

      await gracefulShutdown();
    } catch (error) {
      forgeDebug({
        scope: 'schedules',
        level: 'error',
        message: `stop failed: ${error instanceof Error ? error.message : String(error)}`,
        context: {},
      });
    }
  }

  async function registerSchedule(scheduleRecord: StoredSchedule | null) {
    if (!scheduleRecord || !scheduleRecord.isActive) {
      return;
    }

    try {
      // Cancel any existing node-schedule timer for this ID to prevent duplicate
      // registrations (e.g. from concurrent updateSchedule + loadAll). Without this,
      // node-schedule keeps both old and new timer references and fires twice.
      cancelScheduledJob(scheduleRecord.scheduleId);

      if (scheduleRecord.scheduleType === 'date') {
        if (!scheduleRecord.scheduledDate) {
          throw new Error(`Date schedule ${scheduleRecord.scheduleId} is missing scheduledDate`);
        }

        const scheduledDate = new Date(scheduleRecord.scheduledDate);

        if (scheduledDate.getTime() <= Date.now()) {
          await store.deactivateSchedule(scheduleRecord.scheduleId);
          return;
        }

        const job = scheduleJob(scheduleRecord.scheduleId, scheduledDate, async (fireDate) => {
          await triggerSchedule(scheduleRecord, fireDate, false);
        });

        jobs.set(scheduleRecord.scheduleId, job);
        await store.setNextTriggerAt(scheduleRecord.scheduleId, scheduledDate.getTime());
        return;
      }

      if (!scheduleRecord.cronExpression) {
        throw new Error(`Cron schedule ${scheduleRecord.scheduleId} is missing cronExpression`);
      }

      // Validate cron expression syntax before scheduling — node-schedule silently
      // accepts malformed expressions and creates a job that never fires.
      try {
        (cronParser.parseExpression as any)(scheduleRecord.cronExpression);
      } catch {
        forgeDebug({ scope: 'schedules', level: 'error', message: 'Invalid cron expression for schedule', context: { scheduleId: scheduleRecord.scheduleId, cronExpression: scheduleRecord.cronExpression } });
        throw new Error(`Invalid cron expression for schedule ${scheduleRecord.scheduleId}: ${scheduleRecord.cronExpression}`);
      }

      const spec: RecurrenceSpecDateRange = {
        rule: scheduleRecord.cronExpression,
        tz: scheduleRecord.timezone,
      };
      const job = scheduleJob(scheduleRecord.scheduleId, spec, async (fireDate) => {
        const nextInvocation = jobs.get(scheduleRecord.scheduleId)?.nextInvocation();

        await triggerSchedule(
          scheduleRecord,
          fireDate,
          true,
          nextInvocation?.getTime() ?? null,
        );
      });

      jobs.set(scheduleRecord.scheduleId, job);
      await store.setNextTriggerAt(scheduleRecord.scheduleId, job.nextInvocation()?.getTime() ?? null);
    } catch (error) {
      forgeDebug({
        scope: 'schedules',
        level: 'error',
        message: `registerSchedule failed: ${error instanceof Error ? error.message : String(error)}`,
        context: { scheduleId: scheduleRecord.scheduleId, kind: scheduleRecord.kind },
      });
      forgeDebug({ scope: 'schedules-manager', level: 'error', message: 'schedules-manager: operation failed', error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
  }

  async function triggerSchedule(
    scheduleRecord: StoredSchedule,
    fireDate: Date,
    remainsActive: boolean,
    nextTriggerAt: number | null = null,
  ) {
    cancelCompletedDateJob(scheduleRecord.scheduleId, remainsActive);
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
          name: scheduleRecord.name,
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
  }

  function cancelCompletedDateJob(scheduleId: string, remainsActive: boolean) {
    if (remainsActive) {
      return;
    }

    cancelScheduledJob(scheduleId);
  }

  function cancelScheduledJob(scheduleId: string) {
    const job = jobs.get(scheduleId);

    if (!job) {
      return;
    }

    job.cancel();
    jobs.delete(scheduleId);
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

