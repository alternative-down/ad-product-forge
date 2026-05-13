import { describe, expect, test } from 'vitest';
import {
  parseScheduleDate,
  validateScheduleShape,
  assertFutureScheduledDate,
  createNotificationContent,
  createWakeContent,
  createHeartbeatWakeInstruction,
  toToolOutput,
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

  test('returns when scheduledDate is undefined', () => {
    expect(() => assertFutureScheduledDate('date', undefined)).not.toThrow();
  });

  test('returns when scheduledDate is exactly now', () => {
    expect(() => assertFutureScheduledDate('date', Date.now())).toThrow(
      'scheduledDate must be in the future',
    );
  });
});

describe('createNotificationContent', () => {
  const fireDate = new Date('2026-06-01T12:00:00.000Z');

  test('agent schedule: includes scheduleId in title', () => {
    const result = createNotificationContent({
      agentId: 'agent_001',
      scheduleId: 'sched_001',
      kind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: 'Run report',
      fireDate,
    });

    expect(result).toContain('Cron: sched_001');
  });

  test('heartbeat: title is just Cron', () => {
    const result = createNotificationContent({
      agentId: 'agent_001',
      scheduleId: 'sched_001',
      kind: 'heartbeat',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: 'Run report',
      fireDate,
    });

    expect(result).toContain('Cron');
    expect(result).not.toContain('sched_001');
  });

  test('includes description when provided', () => {
    const result = createNotificationContent({
      agentId: 'agent_001',
      scheduleId: 'sched_001',
      kind: 'agent',
      description: 'A helpful description',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: 'Run report',
      fireDate,
    });

    expect(result).toContain('Description: A helpful description');
  });

  test('excludes description section when not provided', () => {
    const result = createNotificationContent({
      agentId: 'agent_001',
      scheduleId: 'sched_001',
      kind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: 'Run report',
      fireDate,
    });

    expect(result).not.toContain('Description:');
  });

  test('includes task content when provided', () => {
    const result = createNotificationContent({
      agentId: 'agent_001',
      scheduleId: 'sched_001',
      kind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: 'Send email report',
      fireDate,
    });

    expect(result).toContain('Task:');
    expect(result).toContain('Send email report');
  });

  test('excludes task section when content is empty', () => {
    const result = createNotificationContent({
      agentId: 'agent_001',
      scheduleId: 'sched_001',
      kind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      fireDate,
    });

    expect(result).not.toContain('Task:');
  });

  test('includes fire date ISO string', () => {
    const result = createNotificationContent({
      agentId: 'agent_001',
      scheduleId: 'sched_001',
      kind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      fireDate,
    });

    expect(result).toContain('2026-06-01T12:00:00.000Z');
  });

  test('trims description whitespace', () => {
    const result = createNotificationContent({
      agentId: 'agent_001',
      scheduleId: 'sched_001',
      kind: 'agent',
      description: '  spaced description  ',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      fireDate,
    });

    expect(result).toContain('Description: spaced description');
    expect(result).not.toContain('  spaced description  ');
  });

  test('trims content whitespace', () => {
    const result = createNotificationContent({
      agentId: 'agent_001',
      scheduleId: 'sched_001',
      kind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '  run this  ',
      fireDate,
    });

    expect(result).toContain('Task:\nrun this');
    expect(result).not.toContain('  run this  ');
  });
});

describe('createWakeContent', () => {
  test('agent schedule: uses correct trigger message', () => {
    const result = createWakeContent({
      name: 'My Schedule',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: 'Do the thing',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Scheduled task triggered.');
  });

  test('heartbeat: uses heartbeat message', () => {
    const result = createWakeContent({
      name: 'My Schedule',
      scheduleKind: 'heartbeat',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: true,
    });

    expect(result).toContain('Heartbeat triggered.');
  });

  test('includes schedule name', () => {
    const result = createWakeContent({
      name: 'Daily Report',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Schedule name: Daily Report');
  });

  test('includes schedule kind', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Schedule kind: agent');
  });

  test('includes schedule type', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Schedule type: cron');
  });

  test('includes timezone', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'date',
      scheduledDate: 1717200000000,
      timezone: 'America/Sao_Paulo',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Timezone: America/Sao_Paulo');
  });

  test('wake while running enabled', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: true,
    });

    expect(result).toContain('Wake while running: enabled');
  });

  test('wake while running only when idle', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Wake while running: only when idle');
  });

  test('includes description when provided', () => {
    const result = createWakeContent({
      name: 'Test',
      description: 'Important task',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Description: Important task');
  });

  test('skips description when not provided', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).not.toContain('Description:');
  });

  test('trims description whitespace', () => {
    const result = createWakeContent({
      name: 'Test',
      description: '  trimmed desc  ',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Description: trimmed desc');
    expect(result).not.toContain('  trimmed desc  ');
  });

  test('includes cron expression for cron type', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * 1-5',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Cron expression: 0 9 * * 1-5');
  });

  test('skips cron expression for date type', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'date',
      scheduledDate: 1717200000000,
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).not.toContain('Cron expression:');
  });

  test('includes scheduled date for date type', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'date',
      scheduledDate: 1780272000000,
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Scheduled date: 2026-06-01T00:00:00.000Z');
  });

  test('skips scheduled date for cron type', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).not.toContain('Scheduled date:');
  });

  test('includes nextTriggerAt when provided', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
      nextTriggerAt: 1780358400000,
    });

    expect(result).toContain('Next trigger at: 2026-06-02T00:00:00.000Z');
  });

  test('skips nextTriggerAt when not provided', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
    });

    expect(result).not.toContain('Next trigger at:');
  });

  test('includes content section', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: 'Send the report',
      wakeWhenRunning: false,
    });

    expect(result).toContain('\nContent:\nSend the report');
  });

  test('trims content whitespace', () => {
    const result = createWakeContent({
      name: 'Test',
      scheduleKind: 'agent',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      timezone: 'UTC',
      content: '  do this  ',
      wakeWhenRunning: false,
    });

    expect(result).toContain('Content:\ndo this');
    expect(result).not.toContain('  do this  ');
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

describe('toToolOutput', () => {
  test('converts a full schedule record to tool output', () => {
    const record = {
      scheduleId: 'sched_001',
      name: 'My Schedule',
      description: 'A test schedule',
      scheduleType: 'cron' as const,
      cronExpression: '0 9 * * *',
      scheduledDate: undefined,
      timezone: 'UTC',
      content: 'Run the task',
      wakeWhenRunning: true,
      isActive: true,
      lastTriggeredAt: 1780272000000,
      nextTriggerAt: 1780358400000,
    };

    const result = toToolOutput(record);

    expect(result.scheduleId).toBe('sched_001');
    expect(result.name).toBe('My Schedule');
    expect(result.description).toBe('A test schedule');
    expect(result.scheduleType).toBe('cron');
    expect(result.cronExpression).toBe('0 9 * * *');
    expect(result.timezone).toBe('UTC');
    expect(result.content).toBe('Run the task');
    expect(result.wakeWhenRunning).toBe(true);
    expect(result.isActive).toBe(true);
    expect(result.lastTriggeredAt).toBe('2026-06-01T00:00:00.000Z');
    expect(result.nextTriggerAt).toBe('2026-06-02T00:00:00.000Z');
    expect(result.scheduledDate).toBeUndefined();
  });

  test('converts a date-type schedule', () => {
    const record = {
      scheduleId: 'sched_002',
      name: 'One-time task',
      scheduleType: 'date' as const,
      scheduledDate: 1781273600000,
      timezone: 'America/Sao_Paulo',
      content: 'Send report',
      wakeWhenRunning: false,
      isActive: false,
    };

    const result = toToolOutput(record);

    expect(result.scheduleId).toBe('sched_002');
    expect(result.scheduleType).toBe('date');
    expect(result.scheduledDate).toBe('2026-06-12T14:13:20.000Z');
    expect(result.wakeWhenRunning).toBe(false);
    expect(result.isActive).toBe(false);
    expect(result.lastTriggeredAt).toBeUndefined();
    expect(result.nextTriggerAt).toBeUndefined();
  });

  test('omits optional fields when not present', () => {
    const record = {
      scheduleId: 'sched_003',
      name: 'Minimal schedule',
      scheduleType: 'cron' as const,
      cronExpression: '*/5 * * * *',
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
      isActive: true,
    };

    const result = toToolOutput(record);

    expect(result.description).toBeUndefined();
    expect(result.lastTriggeredAt).toBeUndefined();
    expect(result.nextTriggerAt).toBeUndefined();
    expect(result.scheduledDate).toBeUndefined();
    expect(result.cronExpression).toBe('*/5 * * * *');
  });

  test('converts timestamp fields to ISO strings', () => {
    const record = {
      scheduleId: 'sched_004',
      name: 'Timestamp test',
      scheduleType: 'date' as const,
      scheduledDate: 1719000000000,
      timezone: 'UTC',
      content: '',
      wakeWhenRunning: false,
      isActive: true,
      lastTriggeredAt: 1782021600000,
      nextTriggerAt: 1782152000000,
    };

    const result = toToolOutput(record);

    expect(result.lastTriggeredAt).toBe('2026-06-21T06:00:00.000Z');
    expect(result.nextTriggerAt).toBe('2026-06-22T18:13:20.000Z');
  });
});