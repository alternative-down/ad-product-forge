import { describe, expect, test, vi, beforeEach } from 'vitest';
import {
  parseScheduleDate,
  validateScheduleShape,
  assertFutureScheduledDate,
  createNotificationContent,
  createWakeContent,
  createHeartbeatWakeInstruction,
} from './schedule-helpers';

// ─── parseScheduleDate ────────────────────────────────────────────────────────

describe('parseScheduleDate', () => {
  test('parses a valid ISO-8601 date string', () => {
    const result = parseScheduleDate('2026-07-15T10:00:00.000Z');
    expect(result).toBe(Date.parse('2026-07-15T10:00:00.000Z'));
  });

  test('parses a valid locale date string', () => {
    const result = parseScheduleDate('July 15 2026 10:00');
    expect(result).toBe(Date.parse('July 15 2026 10:00'));
  });

  test('throws on invalid date string', () => {
    expect(() => parseScheduleDate('not-a-date')).toThrow('Invalid scheduledDate: not-a-date');
  });

  test('throws on empty string', () => {
    expect(() => parseScheduleDate('')).toThrow('Invalid scheduledDate: ');
  });
});

// ─── validateScheduleShape ────────────────────────────────────────────────────

describe('validateScheduleShape', () => {
  test('does not throw for valid cron shape', () => {
    expect(() =>
      validateScheduleShape({ scheduleType: 'cron', cronExpression: '*/5 * * * *' }),
    ).not.toThrow();
  });

  test('does not throw for valid date shape', () => {
    expect(() =>
      validateScheduleShape({ scheduleType: 'date', scheduledDate: Date.now() + 86400000 }),
    ).not.toThrow();
  });

  test('throws when scheduleType is cron and cronExpression is missing', () => {
    expect(() => validateScheduleShape({ scheduleType: 'cron' })).toThrow(
      'cronExpression is required when scheduleType is cron',
    );
  });

  test('throws when scheduleType is date and scheduledDate is missing', () => {
    expect(() => validateScheduleShape({ scheduleType: 'date' })).toThrow(
      'scheduledDate is required when scheduleType is date',
    );
  });

  test('throws when cronExpression is empty string', () => {
    expect(() => validateScheduleShape({ scheduleType: 'cron', cronExpression: '' })).toThrow(
      'cronExpression is required when scheduleType is cron',
    );
  });
});

// ─── assertFutureScheduledDate ────────────────────────────────────────────────

describe('assertFutureScheduledDate', () => {
  test('returns early when scheduleType is cron', () => {
    expect(() => assertFutureScheduledDate('cron')).not.toThrow();
  });

  test('returns early when scheduleType is date but no scheduledDate provided', () => {
    expect(() => assertFutureScheduledDate('date')).not.toThrow();
  });

  test('returns early when scheduledDate is in the future', () => {
    const future = Date.now() + 86400000;
    expect(() => assertFutureScheduledDate('date', future)).not.toThrow();
  });

  test('throws when scheduledDate is in the past', () => {
    const past = Date.now() - 86400000;
    expect(() => assertFutureScheduledDate('date', past)).toThrow(
      'scheduledDate must be in the future',
    );
  });

  test('throws when scheduledDate equals now (boundary)', () => {
    const now = Date.now();
    expect(() => assertFutureScheduledDate('date', now)).toThrow(
      'scheduledDate must be in the future',
    );
  });
});

// ─── createNotificationContent ───────────────────────────────────────────────

describe('createNotificationContent', () => {
  const baseInput = {
    agentId: 'agent-1',
    scheduleId: 'sched-1',
    kind: 'agent' as const,
    name: 'Daily Sync',
    description: undefined as string | undefined,
    scheduleType: 'cron' as const,
    cronExpression: '0 9 * * *',
    scheduledDate: undefined as number | undefined,
    timezone: 'UTC',
    content: 'Run daily sync',
    fireDate: new Date('2026-07-15T09:00:00.000Z'),
  };

  test('returns sections joined by double newlines', () => {
    const result = createNotificationContent(baseInput);
    expect(result).toBe(
      'Cron: sched-1\n\nTask:\nRun daily sync\n\n2026-07-15T09:00:00.000Z',
    );
  });

  test('includes description when provided and trimmed', () => {
    const withDesc = { ...baseInput, description: '  Important daily task  ' };
    const result = createNotificationContent(withDesc);
    expect(result).toContain('Description: Important daily task');
  });

  test('omits description section when description is empty string', () => {
    const withEmptyDesc = { ...baseInput, description: '' };
    const result = createNotificationContent(withEmptyDesc);
    expect(result).not.toContain('Description:');
  });

  test('omits description section when description is only whitespace', () => {
    const withWs = { ...baseInput, description: '   \n\t  ' };
    const result = createNotificationContent(withWs);
    expect(result).not.toContain('Description:');
  });

  test('uses "Cron" title for heartbeat kind', () => {
    const heartbeat = { ...baseInput, kind: 'heartbeat' as const };
    const result = createNotificationContent(heartbeat);
    expect(result.startsWith('Cron\n\n')).toBe(true);
  });

  test('appends fireDate ISO string as last line', () => {
    const result = createNotificationContent(baseInput);
    expect(result.endsWith('2026-07-15T09:00:00.000Z')).toBe(true);
  });

  test('handles date scheduleType', () => {
    const dateInput = {
      ...baseInput,
      scheduleType: 'date' as const,
      scheduledDate: Date.parse('2026-07-15T09:00:00.000Z'),
    };
    const result = createNotificationContent(dateInput);
    expect(result).toContain('Run daily sync');
  });
});

// ─── createWakeContent ────────────────────────────────────────────────────────

describe('createWakeContent', () => {
  const baseInput = {
    name: 'Nightly Report',
    description: undefined as string | undefined,
    scheduleKind: 'agent' as const,
    scheduleType: 'cron' as const,
    cronExpression: '0 2 * * *',
    scheduledDate: null as number | null,
    timezone: 'America/New_York',
    nextTriggerAt: null as number | null,
    content: 'Generate nightly report',
    wakeWhenRunning: false,
  };

  test('returns string with schedule info and content', () => {
    const result = createWakeContent(baseInput);
    expect(result).toContain('Scheduled task triggered.');
    expect(result).toContain('Schedule name: Nightly Report');
    expect(result).toContain('Schedule kind: agent');
    expect(result).toContain('Schedule type: cron');
    expect(result).toContain('Timezone: America/New_York');
    expect(result).toContain('Wake while running: only when idle');
    expect(result).toContain('Cron expression: 0 2 * * *');
    expect(result).toContain('Content:');
    expect(result).toContain('Generate nightly report');
  });

  test('uses "Heartbeat triggered." for heartbeat kind', () => {
    const heartbeat = { ...baseInput, scheduleKind: 'heartbeat' as const };
    const result = createWakeContent(heartbeat);
    expect(result.startsWith('Heartbeat triggered.')).toBe(true);
  });

  test('includes description when provided and trimmed', () => {
    const withDesc = { ...baseInput, description: '  Nightly backup  ' };
    const result = createWakeContent(withDesc);
    expect(result).toContain('Description: Nightly backup');
  });

  test('omits description when only whitespace', () => {
    const withWs = { ...baseInput, description: '   \n' };
    const result = createWakeContent(withWs);
    expect(result).not.toContain('Description:');
  });

  test('omits description when undefined', () => {
    const result = createWakeContent(baseInput);
    expect(result).not.toContain('Description:');
  });

  test('includes Scheduled date for date scheduleType', () => {
    const dateInput = {
      ...baseInput,
      scheduleType: 'date' as const,
      cronExpression: null,
      scheduledDate: 1752535200000,
    };
    const result = createWakeContent(dateInput);
    expect(result).toContain('Scheduled date:');
    expect(result).not.toContain('Cron expression:');
  });

  test('omits nextTriggerAt section when null', () => {
    const result = createWakeContent(baseInput);
    expect(result).not.toContain('Next trigger at:');
  });

  test('includes nextTriggerAt when provided', () => {
    const withNext = { ...baseInput, nextTriggerAt: 1752535200000 };
    const result = createWakeContent(withNext);
    expect(result).toContain('Next trigger at:');
  });

  test('omits scheduledDate section when null (for date type)', () => {
    const dateInput = {
      ...baseInput,
      scheduleType: 'date' as const,
      cronExpression: null,
      scheduledDate: null,
    };
    const result = createWakeContent(dateInput);
    expect(result).not.toContain('Scheduled date:');
  });

  test('sets wakeWhenRunning: enabled when true', () => {
    const withWake = { ...baseInput, wakeWhenRunning: true };
    const result = createWakeContent(withWake);
    expect(result).toContain('Wake while running: enabled');
  });

  test('sets wakeWhenRunning: only when idle when false', () => {
    const result = createWakeContent(baseInput);
    expect(result).toContain('Wake while running: only when idle');
  });
});

// ─── createHeartbeatWakeInstruction ───────────────────────────────────────────

describe('createHeartbeatWakeInstruction', () => {
  test('returns custom content when provided and non-empty', () => {
    const result = createHeartbeatWakeInstruction('Custom heartbeat content');
    expect(result).toBe('Custom heartbeat content');
  });

  test('trims custom content', () => {
    const result = createHeartbeatWakeInstruction('  trimmed  ');
    expect(result).toBe('trimmed');
  });

  test('returns default instruction when custom content is empty', () => {
    const result = createHeartbeatWakeInstruction('');
    expect(result).toContain('Phase 1. Recover the current reality.');
    expect(result).toContain('Phase 2. Widen your view without leaving your role.');
  });

  test('returns default instruction when custom content is only whitespace', () => {
    const result = createHeartbeatWakeInstruction('  \n\t  ');
    expect(result).toContain('Phase 1. Recover the current reality.');
  });

  test('returns default instruction when custom content is undefined', () => {
    const result = createHeartbeatWakeInstruction(undefined);
    expect(result).toContain('Phase 1. Recover the current reality.');
  });

  test('default instruction includes Phase 2', () => {
    const result = createHeartbeatWakeInstruction(undefined);
    expect(result).toContain('Phase 2. Widen your view without leaving your role.');
  });

  test('default instruction includes Phase 3', () => {
    const result = createHeartbeatWakeInstruction(undefined);
    expect(result).toContain('Phase 3.');
  });
});
