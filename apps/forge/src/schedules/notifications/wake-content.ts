import { forgeDebug } from "@forge-runtime/core";


export function parseScheduleDate(value: string) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    forgeDebug({
      scope: 'schedule-helpers',
      level: 'warn',
      message: 'parseScheduleDate: invalid date',
      context: { scheduledDate: value },
    });
    throw new Error(`Invalid scheduledDate: ${value}`);
  }

  return timestamp;
}

export function validateScheduleShape(input: {
  scheduleType: 'cron' | 'date';
  cronExpression?: string;
  scheduledDate?: number;
}) {
  if (input.scheduleType === 'cron' && (input.cronExpression == null || input.cronExpression === '')) {
    forgeDebug({
      scope: 'schedule-helpers',
      level: 'warn',
      message: 'validateScheduleShape: cronExpression required for cron',
    });
    throw new Error('cronExpression is required when scheduleType is cron');
  }

  if (input.scheduleType === 'date' && (input.scheduledDate == null || input.scheduledDate === 0)) {
    forgeDebug({
      scope: 'schedule-helpers',
      level: 'warn',
      message: 'validateScheduleShape: scheduledDate required for date',
    });
    throw new Error('scheduledDate is required when scheduleType is date');
  }
}

export function assertFutureScheduledDate(scheduleType: 'cron' | 'date', scheduledDate?: number) {
  if (scheduleType !== 'date' || scheduledDate == null || scheduledDate === 0) {
    return;
  }

  if ((scheduledDate as number) <= Date.now()) {
    forgeDebug({
      scope: 'schedule-helpers',
      level: 'warn',
      message: 'assertFutureScheduledDate: must be in future',
      context: { scheduledDate },
    });
    throw new Error('scheduledDate must be in the future');
  }
}

export function createNotificationContent(input: {
  agentId: string;
  scheduleId: string;
  kind: 'agent' | 'heartbeat';
  description?: string | null;
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

  if (description != null && description !== '') {
    sections.push(`Description: ${description}`);
  }

  if (content) {
    sections.push(`Task:\n${content}`);
  }

  sections.push(input.fireDate.toISOString());

  return sections.join('\n\n');
}

export function createWakeContent(input: {
  name: string;
  description?: string | null;
  scheduleKind: 'agent' | 'heartbeat';
  scheduleType: 'cron' | 'date';
  cronExpression?: string | null;
  scheduledDate?: number | null;
  timezone: string;
  nextTriggerAt?: number | null;
  content: string;
  wakeWhenRunning: boolean;
}) {
  const lines = [
    input.scheduleKind === 'heartbeat' ? 'Heartbeat triggered.' : 'Scheduled task triggered.',
    `Schedule name: ${input.name}`,
    `Schedule kind: ${input.scheduleKind}`,
    `Schedule type: ${input.scheduleType}`,
    `Timezone: ${input.timezone}`,
    `Wake while running: ${input.wakeWhenRunning ? 'enabled' : 'only when idle'}`,
  ];

  if (input.description != null && input.description.trim() !== '') {
    lines.push(`Description: ${input.description.trim()}`);
  }

  if (input.scheduleType === 'cron' && input.cronExpression !== undefined) {
    lines.push(`Cron expression: ${input.cronExpression}`);
  }

  if (input.scheduleType === 'date' && input.scheduledDate !== undefined) {
    lines.push(`Scheduled date: ${new Date(input.scheduledDate as number).toISOString()}`);
  }

  if (input.nextTriggerAt !== undefined) {
    lines.push(`Next trigger at: ${new Date(input.nextTriggerAt as number).toISOString()}`);
  }

  lines.push('', 'Content:', input.content.trim());
  return lines.join('\n');
}

export function createHeartbeatWakeInstruction(content?: string) {
  const customContent = content?.trim();

  if (customContent !== undefined && customContent !== '') {
    return customContent;
  }

  const lines = [
    'Use this heartbeat to recover context, widen your view inside your role, clean your workspace records, and turn what you notice into useful action.',
    '',
    'Phase 1. Recover the current reality.',
    '- Read unread conversations and unread notifications.',
    '  Why: they are the clearest signs of change, obligation, blockers, and follow-up. If you ignore them, you work from a stale picture.',
    '  What to do: separate real work from noise, inspect the source behind important notifications, and build a short priority picture of what now matters most.',
    '',
    'Phase 2. Identify what deserves your attention.',
    '- Inspect pending crons, your task queue, and any state changes that have accumulated since your last run.',
    '  Why: work can pile up invisibly between heartbeats.',
    '  What to do: list crons, re-read your context files, check for new issues assigned to you.',
    '',
    'Phase 3. Prioritize ruthlessly.',
    '- Pick the 1–3 most important actions.',
    '  Why: you cannot do everything. Doing a few things well is better than many things poorly.',
    '  What to do: apply the following order: (1) unblocked work, (2) dependency unblocking, (3) critical information gathering, (4) risk reduction, (5) everything else.',
    '',
    'Phase 4. Act.',
    '- Execute the prioritized actions.',
    '  Why: execution creates value; analysis without action is overhead.',
    '  What to do: use your tools to advance each chosen action, push code, send messages, update your context files.',
    '',
    'Phase 5. End cleanly.',
    '- Write or update a short status note in your workspace.',
    '  Why: your next run will thank you. Stale context is a trap.',
    '  What to do: record open threads, pending decisions, and what comes next. Remove or archive anything that is resolved.',
  ];

  return lines.join('\n');
}

export function toToolOutput(scheduleRecord: {
  scheduleId: string;
  name: string;
  description?: string | null;
  scheduleType: 'cron' | 'date';
  cronExpression?: string;
  scheduledDate?: number;
  timezone: string;
  content: string;
  wakeWhenRunning: boolean;
  isActive: boolean;
  lastTriggeredAt?: number;
  nextTriggerAt?: number;
}) {
  return {
    scheduleId: scheduleRecord.scheduleId,
    name: scheduleRecord.name,
    description: scheduleRecord.description ?? undefined,
    scheduleType: scheduleRecord.scheduleType,
    cronExpression: scheduleRecord.cronExpression,
    scheduledDate:
      scheduleRecord.scheduledDate !== undefined
        ? new Date(scheduleRecord.scheduledDate).toISOString()
        : undefined,
    timezone: scheduleRecord.timezone,
    content: scheduleRecord.content,
    wakeWhenRunning: scheduleRecord.wakeWhenRunning,
    isActive: scheduleRecord.isActive,
    lastTriggeredAt:
      scheduleRecord.lastTriggeredAt !== undefined
        ? new Date(scheduleRecord.lastTriggeredAt).toISOString()
        : undefined,
    nextTriggerAt:
      scheduleRecord.nextTriggerAt !== undefined
        ? new Date(scheduleRecord.nextTriggerAt).toISOString()
        : undefined,
  };
}
