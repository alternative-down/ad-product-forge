import { describe, expect, test } from 'vitest';
import {
  parseScheduleDate,
  validateScheduleShape,
  assertFutureScheduledDate,
  createNotificationContent,
  createWakeContent,
  createHeartbeatWakeInstruction,
} from './schedule-helpers';

describe('parseScheduleDate', () => {
  test('parses valid ISO date string', () => {
    const result = parseScheduleDate('2026-06-01T12:00:00.000Z');
    expect(result).toBe(new Date('2026-06-01T12:00:00.000Z').getTime());
  });

  test('throws for invalid date string', () => {
    expect(() => parseScheduleDate('not-a-date')).toThrow('Invalid scheduledDate: not-a-date');
  });

  test('throws for empty string', () => {
    expect(() => parseScheduleDate('')).toThrow('Invalid scheduledDate: ');
  });
});

describe('validateScheduleShape', () => {
  test('passes for cron with cronExpression', () => {
    expect(() =>
      validateScheduleShape({ scheduleType: 'cron', cronExpression: '0 9 * * *' }),
    ).not.toThrow();
  });

  test('throws for cron without cronExpression', () => {
    expect(() => validateScheduleShape({ scheduleType: 'cron' })).toThrow(
      'cronExpression is required when scheduleType is cron',
    );
  });

  test('passes for date with scheduledDate', () => {
    expect(() => validateScheduleShape({ scheduleType: 'date', scheduledDate: 1717200000000 })).not.toThrow();
  });

  test('throws for date without scheduledDate', () => {
    expect(() => validateScheduleShape({ scheduleType: 'date' })).toThrow(
      'scheduledDate is required when scheduleType is date',
    );
  });
});

describe('assertFutureScheduledDate', () => {
  test('returns for cron schedule', () => {
    expect(() => assertFutureScheduledDate('cron', Date.now() + 86400000)).not.toThrow();
  });

  test('returns when scheduledDate is in the future', () => {
    expect(() => assertFutureScheduledDate('date', Date.now() + 86400000)).not.toThrow();
  });

  test('throws when scheduledDate is in the past', () => {
    expect(() => assertFutureScheduledDate('date', Date.now() - 86400000)).toThrow(
      'scheduledDate must be in the future',
    );
  });

  test('throws when scheduledDate is exactly now', () => {
    expect(() => assertFutureScheduledDate('date', Date.now() - 1)).toThrow(
      'scheduledDate must be in the future',
    );
  });
});

describe('createNotificationContent', () => {
  test('agent schedule includes scheduleId in title', () => {
    const result = createNotificationContent({
      agentId: 'agent-1',
      scheduleId: 'sched-123',
      kind: 'agent',
      name: 'Morning sync',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: 'Check dashboard',
      fireDate: new Date('2026-06-01T09:00:00.000Z'),
    });

    expect(result).toContain('Cron: sched-123');
    expect(result).toContain('Task:');
    expect(result).toContain('Check dashboard');
    expect(result).toContain('2026-06-01T09:00:00.000Z');
  });

  test('heartbeat schedule uses simple title', () => {
    const result = createNotificationContent({
      agentId: 'agent-1',
      scheduleId: 'sched-456',
      kind: 'heartbeat',
      name: 'Heartbeat',
      scheduleType: 'cron',
      cronExpression: '*/15 * * * *',
      timezone: 'America/New_York',
      content: '',
      fireDate: new Date('2026-06-01T09:00:00Z'),
    });

    expect(result).toContain('Cron\n');
    expect(result).not.toContain('Cron:');
  });

  test('includes description when provided', () => {
    const result = createNotificationContent({
      agentId: 'agent-1',
      scheduleId: 'sched-789',
      kind: 'agent',
      name: 'Weekly review',
      description: ' Review weekly metrics ',
      scheduleType: 'date',
      scheduledDate: 1717200000000,
      timezone: 'UTC',
      content: 'Generate report',
      fireDate: new Date('2026-06-01T10:00:00Z'),
    });

    expect(result).toContain('Description: Review weekly metrics');
  });

  test('trims content whitespace', () => {
    const result = createNotificationContent({
      agentId: 'agent-1',
      scheduleId: 'sched-abc',
      kind: 'agent',
      name: 'Cleanup',
      scheduleType: 'cron',
      cronExpression: '0 0 * * *',
      timezone: 'UTC',
      content: '  Remove old files  ',
      fireDate: new Date('2026-06-01T00:00:00Z'),
    });

    expect(result).toContain('Task:\nRemove old files');
    expect(result).not.toContain('  Remove old files  ');
  });

  test('includes ISO fire date', () => {
    const fireDate = new Date('2026-06-01T09:00:00Z');
    const result = createNotificationContent({
      agentId: 'agent-1',
      scheduleId: 'sched-fire',
      kind: 'agent',
      name: 'Fire test',
      scheduleType: 'date',
      scheduledDate: 1717200000000,
      timezone: 'UTC',
      content: '',
      fireDate,
    });

    expect(result).toContain(fireDate.toISOString());
  });
});

describe('createWakeContent', () => {
  test('agent schedule includes task description', () => {
    const result = createWakeContent({
      name: 'Morning check',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 8 * * *',
      timezone: 'UTC',
      content: 'Review pending tasks',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Scheduled task triggered.');
    expect(result).toContain('Morning check');
    expect(result).toContain('Schedule kind: agent');
    expect(result).toContain('Cron expression: 0 8 * * *');
    expect(result).toContain('Wake while running: only when idle');
    expect(result).toContain('Content:');
    expect(result).toContain('Review pending tasks');
  });

  test('heartbeat schedule uses heartbeat triggered', () => {
    const result = createWakeContent({
      name: 'Heartbeat check',
      scheduleKind: 'heartbeat',
      scheduleType: 'cron',
      cronExpression: '*/15 * * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: true,
    });

    expect(result).toContain('Heartbeat triggered.');
    expect(result).toContain('Schedule kind: heartbeat');
  });

  test('includes description when trimmed is non-empty', () => {
    const result = createWakeContent({
      name: 'With description',
      description: '  Important task  ',
      scheduleKind: 'agent',
      scheduleType: 'date',
      scheduledDate: 1717200000000,
      timezone: 'America/Sao_Paulo',
      content: 'Do work',
      wakeWhenRunning: true,
    });

    expect(result).toContain('Description: Important task');
  });

  test('skips description when only whitespace', () => {
    const result = createWakeContent({
      name: 'No description',
      description: '   ',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).not.toContain('Description:');
  });

  test('omits cronExpression for date schedules', () => {
    const result = createWakeContent({
      name: 'Date schedule',
      scheduleKind: 'agent',
      scheduleType: 'date',
      scheduledDate: 1717200000000,
      timezone: 'UTC',
      content: 'One-time task',
      wakeWhenRunning: false,
    });

    expect(result).not.toContain('Cron expression:');
    expect(result).toContain('Scheduled date:');
  });

  test('includes nextTriggerAt when provided', () => {
    const nextTrigger = 1717286400000;
    const result = createWakeContent({
      name: 'Recurring',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      nextTriggerAt: nextTrigger,
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Next trigger at:');
    expect(result).toContain(new Date(nextTrigger).toISOString());
  });

  test('omits nextTriggerAt when null', () => {
    const result = createWakeContent({
      name: 'No next trigger',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      nextTriggerAt: null,
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).not.toContain('Next trigger at:');
  });
});

describe('createHeartbeatWakeInstruction', () => {
  test('returns custom content when provided and non-empty after trim', () => {
    const result = createHeartbeatWakeInstruction('Check pending tasks');
    expect(result).toBe('Check pending tasks');
  });

  test('returns trimmed custom content', () => {
    const result = createHeartbeatWakeInstruction('  Check pending tasks  ');
    expect(result).toBe('Check pending tasks');
  });

  test('returns default instruction when content is empty string', () => {
    const result = createHeartbeatWakeInstruction('');
    expect(result).toContain('Phase 1. Recover the current reality.');
    expect(result).toContain('Phase 2.');
  });

  test('returns default instruction when content is whitespace only', () => {
    const result = createHeartbeatWakeInstruction('   ');
    expect(result).toContain('Phase 1. Recover the current reality.');
    expect(result).toContain('Phase 2.');
  });

  test('returns default instruction when content is undefined', () => {
    const result = createHeartbeatWakeInstruction(undefined);
    expect(result).toContain('Phase 1. Recover the current reality.');
    expect(result).toContain('Phase 2.');
  });

  test('default instruction contains Phase 1 header', () => {
    const result = createHeartbeatWakeInstruction('');
    expect(result).toContain('Phase 1. Recover the current reality.');
  });

  test('default instruction contains Phase 2 header', () => {
    const result = createHeartbeatWakeInstruction('');
    expect(result).toContain('Phase 2.');
  });

  test('default instruction mentions reading unread conversations', () => {
    const result = createHeartbeatWakeInstruction('');
    expect(result).toContain('unread conversations');
  });

  test('default instruction mentions reading unread notifications', () => {
    const result = createHeartbeatWakeInstruction('');
    expect(result).toContain('unread notifications');
  });
});