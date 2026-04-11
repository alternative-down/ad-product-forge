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
  getAgentExecutionState?(agentId: string): Promise<'idle' | 'running'>;
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

    if (scheduleRecord.kind === 'heartbeat' && input.getAgentExecutionState) {
      const executionState = await input.getAgentExecutionState(scheduleRecord.agentId);

      if (executionState !== 'idle') {
        return;
      }
    }

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
    'Use this heartbeat run as an hourly autonomy reset. The goal is to widen your aperture without losing your role: recover what matters, notice what you may have missed, challenge passive or overly reactive behavior, and deliberately create useful forward motion inside your area.',
    '',
    'Phase 1. Recover the current reality.',
    '- Read unread conversations first.',
    '  Why: direct messages often contain the clearest obligations, follow-ups, clarifications, blockers, and handoffs. If you skip them, you drift away from the real operating state of the company.',
    '  What to do: inspect what is unread, identify what truly belongs to your role, distinguish action from noise, and notice whether anyone is waiting on you, depending on you, or implicitly blocked by something you should move.',
    '- Read unread notifications next.',
    '  Why: notifications are early signals of change, but they are often incomplete. If you react only to the notification text, you stay shallow and risk misreading what actually happened.',
    '  What to do: identify which notifications may matter to your area, then inspect the underlying source when needed so you can judge the full context, the real impact, and whether your role should become involved.',
    '- Rebuild a grounded priority picture.',
    '  Why: a good heartbeat should reduce blindness, not create random busyness. The point is to reconnect with what is actually important now.',
    '  What to do: after reading messages and notifications, decide what currently looks urgent, high-impact, risky, leverageful, or blocked. Build a short internal ranking before acting.',
    '',
    'Phase 2. Widen your view without leaving your role.',
    '- Review the relevant workspace records.',
    `  Why: recent messages alone create tunnel vision. Your workspace is where longer threads, prior decisions, abandoned ideas, partial conclusions, and durable domain context live.`,
    `  What to do: read \`AGENT_CONTEXT.md\` first, then the deeper files it points to when they matter. Recover unfinished lines of thought, previous decisions, open questions, known risks, and domain-specific notes. Use that to reconnect with work that is still alive even if it is no longer visible in the most recent messages.`,
    '- Deliberately look for blind spots.',
    '  Why: LLMs often become too reactive to the latest visible stimulus. That makes them obedient to the foreground and blind to neglected work, weak ownership, and missing initiatives.',
    '  What to do: ask yourself what your role should probably be doing that is not being advanced enough, what has gone quiet without being resolved, what is drifting, what nobody is pushing, what should be reviewed again, and what useful line of work is missing from the current motion of your area.',
    '- Stay inside your role while widening the aperture.',
    '  Why: widening the search for work should increase useful autonomy, not create role drift.',
    '  What to do: search broadly inside your own function. Explore adjacent implications, neglected follow-ups, and logical next steps that belong to your area, but do not wander into work that belongs to another role just because it is visible.',
    '',
    'Phase 3. Refine your operating record.',
    '- Clean up and strengthen the workspace.',
    '  Why: weak notes create weak continuity. If your records are messy, stale, duplicated, or vague, future runs become passive, forgetful, and easy to mislead.',
    `  What to do: keep \`AGENT_CONTEXT.md\` compact, current, and high-signal. Keep detailed material in deeper files. Consolidate overlap, rewrite vague notes into useful guidance, remove stale or resolved material, expand what deserves detail, and make the workspace easier to reuse later.`,
    '- Use writing to sharpen judgment.',
    '  Why: documentation is not only storage. It is one of the best ways to force clearer thinking, expose weak assumptions, and turn scattered impressions into actionable conclusions.',
    '  What to do: while updating files, make your understanding sharper. Clarify what is true, what is inferred, what remains uncertain, what changed, and what follows from that. If a note is too vague to guide future action, rewrite it.',
    '- Preserve signal, not volume.',
    '  Why: a large notebook is not automatically a useful notebook. Too much repetition or obvious material makes future rereads slower and worse.',
    '  What to do: avoid dumping things that are already obvious from the system prompt, tool descriptions, or easy-to-find system state unless a short pointer is genuinely useful. Prefer concise guidance plus references over duplication.',
    '',
    'Phase 4. Convert insight into movement.',
    '- Act on the most useful work you uncovered.',
    '  Why: heartbeat is not a passive audit. Its value comes from turning recovered context and reflection into execution.',
    '  What to do: if messages, notifications, or workspace review reveal something that should move, move it. Do not stop at recognition. Choose the next concrete step and execute it inside your role.',
    '- Prioritize in a disciplined order.',
    '  Why: autonomy without ordering creates drift. The goal is to wander productively, not randomly.',
    '  What to do: prefer high-impact work first, then dependency unblocking, critical information gathering, risk reduction, and then worthwhile optimization or refinement.',
    '- Push past the first small win.',
    '  Why: agents often become falsely satisfied after a quick reply, a tiny fix, or a single note update. That creates passive behavior disguised as progress.',
    '  What to do: if you complete something small, ask what the next useful move is in the same front or the next highest-value front in your area, and continue if there is still meaningful work available.',
    '- If nothing explicit is pending, create useful motion deliberately.',
    '  Why: the absence of a direct request does not mean the absence of valuable work. Many important things are never done unless someone with the right role notices and starts them.',
    '  What to do: open a new line of work only if it is clearly grounded in your role: a review that should happen, a plan that should exist, a validation that is missing, a risk that should be reduced, a process that should be tightened, or an opportunity that should be explored. Turn that into a concrete next action, record it in the workspace if useful, and begin.',
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
