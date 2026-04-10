import { gracefulShutdown, scheduleJob, type Job, type RecurrenceSpecDateRange } from 'node-schedule';
import { z } from 'zod';

import type { Database } from '../database/index';
import { createAgentNotificationStore } from '../notifications/store';
import { createAgentScheduleStore } from './store';

const scheduleBaseSchema = {
  name: z.string().min(1),
  description: z.string().optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
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
  isActive: z.boolean().optional(),
});

export function createAgentScheduleManager(input: {
  db: Database;
  getAgentPendingSummary?(agentId: string): Promise<{
    unreadNotificationCount: number;
    unreadConversationCount: number;
    unreadMessageCount: number;
  }>;
  notifyAgent(input: {
    agentId: string;
    scheduleId: string;
    scheduleKind: 'agent' | 'heartbeat';
    scheduleName: string;
    content: string;
    timestamp: number;
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
    const updated = await store.updateOwnedSchedule(agentId, scheduleId, {
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
      content: createWakeContent({
        name: scheduleRecord.name,
        description: scheduleRecord.description,
        scheduleKind: scheduleRecord.kind,
        scheduleType: scheduleRecord.scheduleType,
        cronExpression: scheduleRecord.cronExpression,
        scheduledDate: scheduleRecord.scheduledDate,
        timezone: scheduleRecord.timezone,
        nextTriggerAt,
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
  const title = input.kind === 'heartbeat' ? 'Cron' : `Cron: ${input.scheduleId}`;
  const sections = [title];
  const description = input.description?.trim();
  const content = input.content.trim();

  if (description) {
    sections.push(`Description: ${description}`);
  }

  if (content) {
    sections.push(`Task:\n${content}`);
  }

  sections.push(input.fireDate.toISOString());

  return sections.join('\n\n');
}

function createWakeContent(input: {
  name: string;
  description?: string;
  scheduleKind: 'agent' | 'heartbeat';
  scheduleType: 'cron' | 'date';
  cronExpression?: string | null;
  scheduledDate?: number | null;
  timezone: string;
  nextTriggerAt?: number | null;
  content: string;
}) {
  const lines = [
    input.scheduleKind === 'heartbeat' ? 'Heartbeat triggered.' : 'Scheduled task triggered.',
    `Schedule name: ${input.name}`,
    `Schedule kind: ${input.scheduleKind}`,
    `Schedule type: ${input.scheduleType}`,
    `Timezone: ${input.timezone}`,
  ];

  if (input.description?.trim()) {
    lines.push(`Description: ${input.description.trim()}`);
  }

  if (input.scheduleType === 'cron' && input.cronExpression) {
    lines.push(`Cron expression: ${input.cronExpression}`);
  }

  if (input.scheduleType === 'date' && input.scheduledDate) {
    lines.push(`Scheduled date: ${new Date(input.scheduledDate).toISOString()}`);
  }

  if (input.nextTriggerAt) {
    lines.push(`Next trigger at: ${new Date(input.nextTriggerAt).toISOString()}`);
  }

  lines.push('', 'Content:', input.content.trim());
  return lines.join('\n');
}

function createHeartbeatWakeInstruction(content?: string) {
  const customContent = content?.trim();

  if (customContent) {
    return customContent;
  }

  const lines = [
    'Use this heartbeat run as a structured maintenance and re-orientation cycle. Its purpose is not only to check whether something new arrived, but to restore continuity, recover neglected work, keep your records healthy, and create forward motion even when nobody explicitly asked you for a new task.',
    '',
    'Phase 1. Triage the current inputs.',
    '- Review unread conversations.',
    '  Why: unread conversations often contain direct work, follow-ups, clarifications, dependencies, or silent changes in priority.',
    '  What to do: inspect what is unread, identify whether it requires action from your role, and distinguish real work from background noise.',
    '- Review unread notifications.',
    '  Why: notifications can reveal system events, external changes, or issues that did not arrive as direct conversation threads.',
    '  What to do: identify which notifications create obligations, reveal risk, change context, or deserve investigation.',
    '- Build a short mental priority picture.',
    '  Why: heartbeat should reduce drift, not create random action.',
    '  What to do: after looking at conversations and notifications, decide what appears most important, urgent, risky, or leverageful before moving on.',
    '',
    'Phase 2. Rebuild context before taking action.',
    '- Review the relevant parts of working memory.',
    '  Why: you should continue from your last known state instead of restarting from zero each run.',
    '  What to do: recover current objectives, active tasks, durable facts, learned constraints, pending observations, and anything that affects the work you are about to touch.',
    '- Review the relevant workspace notes and records.',
    '  Why: the workspace is your detailed notebook and often contains context, reasoning, partial conclusions, and follow-ups that are too large or too fluid for working memory.',
    '  What to do: read the files that matter for the current front, recover prior analysis, decisions, open questions, and unfinished threads, and use that material to resume work with continuity.',
    '',
    'Phase 3. Clean and strengthen your records.',
    '- Refactor working memory.',
    '  Why: if working memory becomes stale, redundant, or vague, future runs lose continuity and make worse decisions.',
    '  What to do: remove resolved or obsolete items, rewrite weak notes into durable guidance, register new lasting learnings, update next steps, and keep it concise, current, and worth carrying forward.',
    '- Refactor relevant workspace files.',
    '  Why: your workspace notes should become a useful operational knowledge base, not an unmanaged pile of fragments.',
    '  What to do: consolidate overlapping notes, organize material by topic or workstream, expand what deserves detail, refine conclusions, remove stale material, and leave the workspace easier to revisit later.',
    '- Avoid duplication.',
    '  Why: redundant records create confusion and make the agent reread noise instead of signal.',
    '  What to do: do not repeat what is already obvious in the system prompt, tool descriptions, or other easy-to-find locations unless a short pointer is genuinely useful.',
    '',
    'Phase 4. Turn what you found into action.',
    '- Act on real work revealed by the review.',
    '  Why: heartbeat is not only for maintenance; it should also convert discovered obligations into execution.',
    '  What to do: if conversations, notifications, memory, or workspace review reveal something that should be handled, move it forward instead of merely noting it.',
    '- Choose the next action by priority.',
    '  Why: useful autonomy depends on disciplined prioritization, not random busyness.',
    '  What to do: prioritize high-impact work first, then dependency unblocking, critical information gathering, risk reduction, and finally worthwhile optimization.',
    '',
    'Phase 5. Keep momentum after small wins.',
    '- Do not stop at the first quick completion.',
    '  Why: many runs lose value because the agent solves one small thing and becomes idle while other useful work remains nearby.',
    '  What to do: if you complete something small, immediately look for the next useful action in the same area or in the next highest-value front inside your role.',
    '- If no clear pending item exists, deliberately search for useful work.',
    '  Why: lack of explicit assignment is not the same as lack of useful work.',
    '  What to do: initiate, review, plan, discuss, validate, improve, or investigate something that is logically derived from your goals, obligations, risks, or current context.',
  ];

  return lines.join('\n');
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
