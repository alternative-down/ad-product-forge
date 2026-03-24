import { gracefulShutdown, scheduleJob, type Job, type RecurrenceSpecDateRange } from 'node-schedule';
import { z } from 'zod';

import type { Database } from '../database/index';
import { createAgentNotificationStore } from '../notifications/store';
import { createAgentScheduleStore } from './store';

const createScheduleSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  scheduleType: z.enum(['cron', 'date']),
  cronExpression: z.string().min(1).optional(),
  scheduledDate: z.string().min(1).optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
}).superRefine((input, ctx) => {
  if (input.scheduleType === 'cron' && !input.cronExpression) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['cronExpression'],
      message: 'cronExpression is required when scheduleType is cron',
    });
  }

  if (input.scheduleType === 'date' && !input.scheduledDate) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['scheduledDate'],
      message: 'scheduledDate is required when scheduleType is date',
    });
  }
});

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
  content: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
}).superRefine((input, ctx) => {
  if (Object.keys(input).length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'At least one field must be provided',
    });
  }
});

export function createAgentScheduleManager(input: {
  db: Database;
  notifyAgent(input: { agentId: string; scheduleId: string; content: string; timestamp: number }): void;
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
    const rollbackInput = {
      name: existing.name,
      description: existing.description ?? null,
      scheduleType: existing.scheduleType,
      cronExpression: existing.cronExpression ?? null,
      scheduledDate: existing.scheduledDate ?? null,
      timezone: existing.timezone,
      content: existing.content,
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

  async function deleteSchedule(agentId: string, scheduleId: string) {
    cancelJob(scheduleId);
    return {
      success: await store.deleteAgentSchedule(agentId, scheduleId),
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
      content: createWakeContent({
        agentId: scheduleRecord.agentId,
        scheduleId: scheduleRecord.scheduleId,
        kind: scheduleRecord.kind,
        name: scheduleRecord.name,
        description: scheduleRecord.description,
        scheduleType: scheduleRecord.scheduleType,
        cronExpression: scheduleRecord.cronExpression,
        scheduledDate: scheduleRecord.scheduledDate,
        timezone: scheduleRecord.timezone,
        fireDate,
        content: scheduleRecord.kind === 'agent'
          ? scheduleRecord.content
          : createHeartbeatWakeInstruction(scheduleRecord.agentId),
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
    updateSchedule,
    deleteSchedule,
    removeAgent,
    stop,
  };
}

function parseScheduleDate(value: string) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    throw new Error(`Invalid scheduledDate: ${value}`);
  }

  return timestamp;
}

function validateScheduleShape(input: {
  scheduleType: 'cron' | 'date';
  cronExpression?: string;
  scheduledDate?: number;
}) {
  if (input.scheduleType === 'cron' && !input.cronExpression) {
    throw new Error('cronExpression is required when scheduleType is cron');
  }

  if (input.scheduleType === 'date' && !input.scheduledDate) {
    throw new Error('scheduledDate is required when scheduleType is date');
  }
}

function assertFutureScheduledDate(scheduleType: 'cron' | 'date', scheduledDate?: number) {
  if (scheduleType !== 'date' || !scheduledDate) {
    return;
  }

  if (scheduledDate <= Date.now()) {
    throw new Error('scheduledDate must be in the future');
  }
}

function createNotificationContent(input: {
  agentId: string;
  scheduleId: string;
  kind: 'agent' | 'heartbeat';
  name: string;
  description?: string;
  scheduleType: 'cron' | 'date';
  cronExpression?: string | null;
  scheduledDate?: number | null;
  timezone: string;
  content: string;
  fireDate: Date;
}) {
  const lines = [
    'Scheduled notification received.',
    `Agent id: ${input.agentId}`,
    `Schedule id: ${input.scheduleId}`,
    `Schedule kind: ${input.kind}`,
    `Schedule name: ${input.name}`,
    `Schedule type: ${input.scheduleType}`,
    `Triggered at: ${input.fireDate.toISOString()}`,
    `Timezone: ${input.timezone}`,
  ];

  if (input.description) {
    lines.push(`Description: ${input.description}`);
  }

  if (input.cronExpression) {
    lines.push(`Cron expression: ${input.cronExpression}`);
  }

  if (input.scheduledDate) {
    lines.push(`Scheduled date: ${new Date(input.scheduledDate).toISOString()}`);
  }

  lines.push('', 'Content:', input.content);

  return lines.join('\n');
}

function createWakeContent(input: {
  agentId: string;
  scheduleId: string;
  kind: 'agent' | 'heartbeat';
  name: string;
  description?: string | null;
  scheduleType: 'cron' | 'date';
  cronExpression?: string | null;
  scheduledDate?: number | null;
  timezone: string;
  fireDate: Date;
  content: string;
}) {
  const lines = [
    'Scheduled wake event received.',
    `Agent id: ${input.agentId}`,
    `Schedule id: ${input.scheduleId}`,
    `Schedule kind: ${input.kind}`,
    `Schedule name: ${input.name}`,
    `Schedule type: ${input.scheduleType}`,
    `Triggered at: ${input.fireDate.toISOString()}`,
    `Timezone: ${input.timezone}`,
  ];

  if (input.description) {
    lines.push(`Schedule description: ${input.description}`);
  }

  if (input.cronExpression) {
    lines.push(`Cron expression: ${input.cronExpression}`);
  }

  if (input.scheduledDate) {
    lines.push(`Scheduled date: ${new Date(input.scheduledDate).toISOString()}`);
  }

  lines.push('', 'Scheduled content:', input.content.trim());

  return lines.join('\n');
}

function createHeartbeatWakeInstruction(agentId: string) {
  return [
    `Heartbeat triggered for ${agentId}.`,
    'Use this run to re-orient yourself in the current operational state.',
    'Check your unread conversations, unread notifications, pending schedules, and any unresolved work you may have left behind in earlier runs.',
    'If you find pending work, inspect it with tools and act on it. If nothing requires action, stop cleanly.',
  ].join('\n');
}

function toToolOutput(scheduleRecord: {
  scheduleId: string;
  name: string;
  description?: string;
  scheduleType: 'cron' | 'date';
  cronExpression?: string;
  scheduledDate?: number;
  timezone: string;
  content: string;
  isActive: boolean;
  lastTriggeredAt?: number;
  nextTriggerAt?: number;
}) {
  return {
    scheduleId: scheduleRecord.scheduleId,
    name: scheduleRecord.name,
    description: scheduleRecord.description,
    scheduleType: scheduleRecord.scheduleType,
    cronExpression: scheduleRecord.cronExpression,
    scheduledDate: scheduleRecord.scheduledDate ? new Date(scheduleRecord.scheduledDate).toISOString() : undefined,
    timezone: scheduleRecord.timezone,
    content: scheduleRecord.content,
    isActive: scheduleRecord.isActive,
    lastTriggeredAt: scheduleRecord.lastTriggeredAt ? new Date(scheduleRecord.lastTriggeredAt).toISOString() : undefined,
    nextTriggerAt: scheduleRecord.nextTriggerAt ? new Date(scheduleRecord.nextTriggerAt).toISOString() : undefined,
  };
}
