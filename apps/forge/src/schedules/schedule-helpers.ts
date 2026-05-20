import { parseExpression } from 'cron-parser';
import { forgeDebug } from '@forge-runtime/core';

function _validateCronExpression(expression: string): boolean {
  try {
    parseExpression(expression, { utc: true });
    return true;
  } catch (error) {
    forgeDebug({
      scope: 'schedule-helpers',
      level: 'error',
      message: 'Cron expression validation failed',
      context: { error: error instanceof Error ? error.message : String(error) },
    });
    return false;
  }
}

export function parseScheduleDate(value: string) {
  const timestamp = Date.parse(value);

  if (Number.isNaN(timestamp)) {
    forgeDebug({
      scope: 'schedule-helpers',
      level: 'warn',
      message: 'parseScheduledDate: invalid date',
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
  if (input.scheduleType === 'cron' && (input.cronExpression ?? '') === '') {
    forgeDebug({
      scope: 'schedule-helpers',
      level: 'warn',
      message: 'parseScheduleInput: cronExpression required for cron',
    });
    throw new Error('cronExpression is required when scheduleType is cron');
  }

  if (input.scheduleType === 'date' && (input.scheduledDate ?? 0) === 0) {
    forgeDebug({
      scope: 'schedule-helpers',
      level: 'warn',
      message: 'parseScheduleInput: scheduledDate required for date',
    });
    throw new Error('scheduledDate is required when scheduleType is date');
  }
}

export function assertFutureScheduledDate(scheduleType: 'cron' | 'date', scheduledDate?: number) {
  if (scheduleType !== 'date' || (scheduledDate ?? 0) === 0) {
    return;
  }

  if ((scheduledDate as number) <= Date.now()) {
    forgeDebug({
      scope: 'schedule-helpers',
      level: 'warn',
      message: 'parseScheduledDate: must be in future',
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

  if (description !== undefined && description !== '') {
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
    lines.push(`Scheduled date: ${new Date((input as any).scheduledDate).toISOString()}`);
  }

  if (input.nextTriggerAt !== undefined) {
    lines.push(`Next trigger at: ${new Date((input as any).nextTriggerAt).toISOString()}`);
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
    'Phase 2. Widen your view without leaving your role.',
    '- Review the relevant workspace records, starting with `AGENT_CONTEXT.md`.',
    '  Why: recent messages create tunnel vision. The workspace is where longer threads, prior decisions, unfinished ideas, and durable context live.',
    '  What to do: recover what is still alive but no longer visible in the recent foreground, then ask what your role should be moving that is currently neglected, drifting, weakly owned, or missing.',
    '- Widen the search, but stay inside your function.',
    '  Why: the goal is more useful autonomy, not role drift.',
    '  What to do: explore adjacent implications, delayed follow-ups, reviews, validations, and improvements that belong to your area, but do not absorb work that belongs to another role.',
    '',
    'Phase 3. Refine your operating record.',
    '- Clean up the workspace so it remains reusable.',
    '  Why: weak notes create weak continuity. If the record gets stale, duplicated, or vague, future runs become passive and shortsighted.',
    '  What to do: keep `AGENT_CONTEXT.md` compact and high-signal, keep detail in deeper files, rewrite vague notes into useful guidance, remove stale material, and preserve signal over volume.',
    '',
    'Phase 4. Convert insight into movement.',
    '- Act on the most useful work you uncovered.',
    '  Why: heartbeat is valuable only if it turns recovered context into execution.',
    '  What to do: choose the next concrete step by priority: impact first, then dependency unblocking, critical information gathering, risk reduction, and then useful optimization.',
    '- Push past the first small win.',
    '  Why: agents often stop too early after a quick reply, a tiny fix, or a note update.',
    '  What to do: if one small action is done, ask what the next useful move is in the same front or the next best front in your area. If nothing explicit is pending, deliberately start a grounded line of work that your role should already be advancing.',
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
