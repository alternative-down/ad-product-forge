import { gracefulShutdown, scheduleJob, type Job, type RecurrenceSpecDateRange } from 'node-schedule';
import { z } from 'zod';

import type { Database } from '../database/index';
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


const scheduleBaseSchema = {
  name: z.string().min(1),
  description: z.string().optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
  wakeWhenRunning: z.boolean().optional(),
} as const;

const createScheduleSchema = z.discriminatedUnion('scheduleType', [
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

// Schema for creating schedule for another agent (cross-agent)
const createScheduleForAgentSchema = z.discriminatedUnion('scheduleType', [
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

const HEARTBEAT_NAME = 'System heartbeat';
const HEARTBEAT_CRON_EXPRESSION = '0 * * * *';
const HEARTBEAT_TIMEZONE = 'UTC';

const updateScheduleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  scheduleType: z.enum(['cron', 'date']).optional(),
  cronExpression: z.string().min(1).optional().nullable(),
  scheduledDate: z.string().min(1).optional().nullable(),
  timezone: z.string().min(1).optional(),
  content: z.string().optional(),
  wakeWhenRunning: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

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

  async function loadAll() {
    const schedules = await store.listActiveSchedules();

    for (const scheduleRecord of schedules) {
      cancelJob(scheduleRecord.scheduleId);
      await registerSchedule(scheduleRecord);
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
      throw new Error(`Failed to load created schedule: ${record.id}`);
    }

    try {
      await registerSchedule(scheduleRecord);
    } catch (error) {
      await store.deleteAgentSchedule(agentId, record.id);
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
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const scheduleType = parsed.scheduleType ?? existing.scheduleType;
    const cronExpression = parsed.cronExpression === undefined
      ? existing.cronExpression
      : parsed.cronExpression ?? undefined;
    const scheduledDate = parsed.scheduledDate === undefined
      ? existing.scheduledDate
      : parsed.scheduledDate === null
        ? undefined
        : parseScheduleDate(parsed.scheduledDate);

    validateScheduleShape({
      scheduleType,
      cronExpression,
      scheduledDate,
    });
    const shouldRequireFutureDate =
      scheduleType === 'date' &&
      (
        parsed.scheduledDate !== undefined ||
        parsed.scheduleType !== undefined ||
        parsed.isActive === true
      );

    if (shouldRequireFutureDate) {
      assertFutureScheduledDate(scheduleType, scheduledDate);
    }

    const normalizedCronExpression = scheduleType === 'cron'
      ? cronExpression ?? null
      : null;
    const normalizedScheduledDate = scheduleType === 'date'
      ? scheduledDate ?? null
      : null;
    const normalizedWakeWhenRunning = scheduleType === 'cron'
      ? parsed.wakeWhenRunning ?? existing.wakeWhenRunning
      : true;
    const rollbackInput = {
      name: existing.name,
      description: existing.description ?? null,
      scheduleType: existing.scheduleType,
      cronExpression: existing.cronExpression ?? null,
      scheduledDate: existing.scheduledDate ?? null,
      timezone: existing.timezone,
      content: existing.content,
      wakeWhenRunning: existing.wakeWhenRunning,
      isActive: existing.isActive,
    } as const;
    const updated = await store.updateAgentSchedule(agentId, scheduleId, {
      name: parsed.name,
      description: parsed.description,
      scheduleType,
      cronExpression: normalizedCronExpression,
      scheduledDate: normalizedScheduledDate,
      timezone: parsed.timezone,
      content: parsed.content,
      wakeWhenRunning: normalizedWakeWhenRunning,
      isActive: parsed.isActive,
    });

    if (!updated) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    cancelJob(scheduleId);

    try {
      if (updated.isActive) {
        await registerSchedule(updated);
      } else {
        await store.setNextTriggerAt(scheduleId, null);
      }
    } catch (error) {
      const restored = await store.updateAgentSchedule(agentId, scheduleId, rollbackInput);

      if (existing.isActive && restored) {
        await registerSchedule(restored);
      }

      throw error;
    }

    const reloaded = await store.getAgentSchedule(agentId, scheduleId);

    if (!reloaded) {
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

    const scheduleType = parsed.scheduleType ?? existing.scheduleType;
    const cronExpression = parsed.cronExpression === undefined
      ? existing.cronExpression
      : parsed.cronExpression ?? undefined;
    const scheduledDate = parsed.scheduledDate === undefined
      ? existing.scheduledDate
      : parsed.scheduledDate === null
        ? undefined
        : parseScheduleDate(parsed.scheduledDate);

    validateScheduleShape({
      scheduleType,
      cronExpression,
      scheduledDate,
    });
    const shouldRequireFutureDate =
      scheduleType === 'date' &&
      (
        parsed.scheduledDate !== undefined ||
        parsed.scheduleType !== undefined ||
        parsed.isActive === true
      );

    if (shouldRequireFutureDate) {
      assertFutureScheduledDate(scheduleType, scheduledDate);
    }

    const normalizedCronExpression = scheduleType === 'cron'
      ? cronExpression ?? null
      : null;
    const normalizedScheduledDate = scheduleType === 'date'
      ? scheduledDate ?? null
      : null;
    const normalizedWakeWhenRunning = scheduleType === 'cron'
      ? parsed.wakeWhenRunning ?? existing.wakeWhenRunning
      : true;
    const rollbackInput = {
      name: existing.name,
      description: existing.description ?? null,
      scheduleType: existing.scheduleType,
      cronExpression: existing.cronExpression ?? null,
      scheduledDate: existing.scheduledDate ?? null,
      timezone: existing.timezone,
      content: existing.content,
      wakeWhenRunning: existing.wakeWhenRunning,
      isActive: existing.isActive,
    } as const;
    const updated = await store.updateOwnedSchedule(agentId, scheduleId, {
      name: parsed.name,
      description: parsed.description,
      scheduleType,
      cronExpression: normalizedCronExpression,
      scheduledDate: normalizedScheduledDate,
      timezone: parsed.timezone,
      content: parsed.content,
      wakeWhenRunning: normalizedWakeWhenRunning,
      isActive: parsed.isActive,
    });

    if (!updated) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    cancelJob(scheduleId);

    try {
      if (updated.isActive) {
        await registerSchedule(updated);
      } else {
        await store.setNextTriggerAt(scheduleId, null);
      }
    } catch (error) {
      const restored = await store.updateOwnedSchedule(agentId, scheduleId, rollbackInput);

      if (existing.isActive && restored) {
        await registerSchedule(restored);
      }

      throw error;
    }

    const reloaded = await store.getOwnedSchedule(agentId, scheduleId);

    if (!reloaded) {
      throw new Error(`Schedule not found after update: ${scheduleId}`);
    }

    return toToolOutput(reloaded);
  }

  async function deleteSchedule(agentId: string, scheduleId: string) {
    cancelJob(scheduleId);
    return {
      success: await store.deleteAgentSchedule(agentId, scheduleId),
    };
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
      throw new Error(`Failed to load created schedule: ${record.id}`);
    }

    try {
      await registerSchedule(scheduleRecord);
    } catch (error) {
      await store.deleteAgentSchedule(parsed.targetAgentId, record.id);
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
    const isCreator = schedule.creatorId === editorAgentId;
    const isSelfCreated = schedule.creatorId === null && schedule.agentId === editorAgentId;

    if (!isCreator && !isSelfCreated) {
      throw new Error(`Not authorized to edit schedule: ${scheduleId}`);
    }

    // Delegate to updateSchedule with the target agent's ID
    return updateSchedule(schedule.agentId, scheduleId, rawInput);
  }

  // Cross-agent: Delete schedule (only creator can delete)
  async function deleteCron(editorAgentId: string, scheduleId: string) {
    const schedule = await store.getScheduleById(scheduleId);

    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    // Authorization: only creator can delete (or null creator = self-created, only agentId can delete)
    const isCreator = schedule.creatorId === editorAgentId;
    const isSelfCreated = schedule.creatorId === null && schedule.agentId === editorAgentId;

    if (!isCreator && !isSelfCreated) {
      throw new Error(`Not authorized to delete schedule: ${scheduleId}`);
    }

    cancelJob(scheduleId);
    return {
      success: await store.deleteAgentSchedule(schedule.agentId, scheduleId),
    };
  }

  async function removeAgent(agentId: string) {
    const schedules = await store.listAgentSchedules(agentId);

    for (const scheduleRecord of schedules) {
      cancelJob(scheduleRecord.scheduleId);
    }
  }

  async function stop() {
    for (const [scheduleId, job] of jobs) {
      job.cancel();
      jobs.delete(scheduleId);
    }

    await gracefulShutdown();
  }

  async function registerSchedule(scheduleRecord: StoredSchedule | null) {
    if (!scheduleRecord || !scheduleRecord.isActive) {
      return;
    }

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

    cancelJob(scheduleId);
  }

  function cancelJob(scheduleId: string) {
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
  };
}

