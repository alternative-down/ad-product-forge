import { beforeEach, describe, expect, test, vi } from 'vitest';
import { forgeDebug } from '@forge-runtime/core';
import {
  isScheduleEditor,
  requireScheduleEditor,
  requireScheduleDeleter,
} from './auth';
import {
  createScheduleSchema,
  createScheduleForAgentSchema,
} from '../tools/schemas';

// Mock forgeDebug so we can assert the log call shape (scope + message)
// of the auth functions. The actual call body is irrelevant for the tripwire.
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));
const mockedForgeDebug = vi.mocked(forgeDebug);


const makeSchedule = (overrides: any = {}): any =>
  ({
    scheduleId: 'sched-001',
    agentId: 'agent-001',
    name: 'Test Schedule',
    description: null,
    content: 'Test content',
    scheduleType: 'cron',
    cronExpression: '0 9 * * *',
    scheduledDate: null,
    timezone: 'UTC',
    isActive: true,
    nextTriggerAt: null,
    lastTriggerAt: null,
    lastRunStatus: null,
    lastRunError: null,
    creatorId: 'creator-001',
    createdAt: 1717200000000,
    updatedAt: 1717200000000,
    ...(overrides as any),
  }) as any;

// ── createScheduleSchema ────────────────────────────────────────────────────

describe('createScheduleSchema', () => {
  test('accepts valid cron schedule', () => {
    const input = {
      scheduleType: 'cron' as const,
      name: 'Morning standup',
      cronExpression: '0 9 * * *',
      content: 'Run standup agent',
    };
    const result = createScheduleSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('accepts valid date schedule', () => {
    const input = {
      scheduleType: 'date' as const,
      name: 'One-time task',
      scheduledDate: '2026-06-01T12:00:00.000Z',
      content: 'Run task',
    };
    const result = createScheduleSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('rejects cron schedule without cronExpression', () => {
    const input = {
      scheduleType: 'cron' as const,
      name: 'Bad schedule',
      content: 'Missing cron',
    };
    const result = createScheduleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('rejects cron schedule with scheduledDate', () => {
    const input = {
      scheduleType: 'cron' as const,
      name: 'Bad schedule',
      cronExpression: '0 9 * * *',
      scheduledDate: '2026-06-01T12:00:00.000Z',
      content: 'Conflicting fields',
    };
    const result = createScheduleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('rejects date schedule without scheduledDate', () => {
    const input = {
      scheduleType: 'date' as const,
      name: 'Bad schedule',
      content: 'Missing date',
    };
    const result = createScheduleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('rejects empty name', () => {
    const input = {
      scheduleType: 'cron' as const,
      name: '',
      cronExpression: '0 9 * * *',
      content: 'Test',
    };
    const result = createScheduleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('rejects empty content', () => {
    const input = {
      scheduleType: 'cron' as const,
      name: 'Valid name',
      cronExpression: '0 9 * * *',
      content: '',
    };
    const result = createScheduleSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('accepts optional description', () => {
    const input = {
      scheduleType: 'cron' as const,
      name: 'With description',
      cronExpression: '0 9 * * *',
      content: 'Test',
      description: 'Optional description',
    };
    const result = createScheduleSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('defaults timezone to UTC', () => {
    const input = {
      scheduleType: 'cron' as const,
      name: 'Default TZ',
      cronExpression: '0 9 * * *',
      content: 'Test',
    };
    const result = createScheduleSchema.safeParse(input);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBe('UTC');
    }
  });

  test('accepts optional wakeWhenRunning', () => {
    const input = {
      scheduleType: 'cron' as const,
      name: 'Wake test',
      cronExpression: '0 9 * * *',
      content: 'Test',
      wakeWhenRunning: false,
    };
    const result = createScheduleSchema.safeParse(input);
    expect(result.success).toBe(true);
  });
});



// ── createScheduleForAgentSchema ──────────────────────────────────────────

describe('createScheduleForAgentSchema', () => {
  test('accepts valid cron schedule with targetAgentId', () => {
    const input = {
      scheduleType: 'cron' as const,
      name: 'Agent schedule',
      cronExpression: '0 9 * * *',
      content: 'Run for agent',
      targetAgentId: 'target-agent-001',
    };
    const result = createScheduleForAgentSchema.safeParse(input);
    expect(result.success).toBe(true);
  });

  test('rejects without targetAgentId', () => {
    const input = {
      scheduleType: 'cron' as const,
      name: 'Missing target',
      cronExpression: '0 9 * * *',
      content: 'Test',
    };
    const result = createScheduleForAgentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  test('rejects with empty targetAgentId', () => {
    const input = {
      scheduleType: 'cron' as const,
      name: 'Empty target',
      cronExpression: '0 9 * * *',
      content: 'Test',
      targetAgentId: '',
    };
    const result = createScheduleForAgentSchema.safeParse(input);
    expect(result.success).toBe(false);
  });
});

// ── isScheduleEditor ──────────────────────────────────────────────────────

describe('isScheduleEditor', () => {
  test('returns true when requester is creator', () => {
    const schedule = makeSchedule({ creatorId: 'alice', agentId: 'bob' });
    expect(isScheduleEditor(schedule, 'alice')).toBe(true);
  });

  test('returns false when requester is not creator', () => {
    const schedule = makeSchedule({ creatorId: 'alice', agentId: 'bob' });
    expect(isScheduleEditor(schedule, 'bob')).toBe(false);
  });

  test('returns true when creatorId is null and requester is agentId (self-created)', () => {
    const schedule = makeSchedule({ creatorId: null, agentId: 'self-agent' });
    expect(isScheduleEditor(schedule, 'self-agent')).toBe(true);
  });

  test('returns false when creatorId is null and requester is not agentId', () => {
    const schedule = makeSchedule({ creatorId: null, agentId: 'self-agent' });
    expect(isScheduleEditor(schedule, 'other-agent')).toBe(false);
  });

  test('creatorId takes priority over self-created rule', () => {
    const schedule = makeSchedule({ creatorId: 'creator', agentId: 'agent-001' });
    expect(isScheduleEditor(schedule, 'creator')).toBe(true);
    expect(isScheduleEditor(schedule, 'agent-001')).toBe(false);
  });
});

// ── requireScheduleEditor ──────────────────────────────────────────────────

describe('requireScheduleEditor', () => {
  test('does not throw when requester is creator', () => {
    const schedule = makeSchedule({ creatorId: 'alice', agentId: 'bob' });
    expect(() => requireScheduleEditor(schedule, 'alice')).not.toThrow();
  });

  test('throws with correct message when not authorized', () => {
    const schedule = makeSchedule({ scheduleId: 'sched-42', creatorId: 'alice', agentId: 'bob' });
    expect(() => requireScheduleEditor(schedule, 'bob')).toThrow(
      'Not authorized to edit schedule: sched-42',
    );
  });

  test('does not throw for self-created schedule', () => {
    const schedule = makeSchedule({ creatorId: null, agentId: 'self-agent' });
    expect(() => requireScheduleEditor(schedule, 'self-agent')).not.toThrow();
  });
});

// ── requireScheduleDeleter ─────────────────────────────────────────────────

describe('requireScheduleDeleter', () => {
  test('does not throw when requester is creator', () => {
    const schedule = makeSchedule({ creatorId: 'alice', agentId: 'bob' });
    expect(() => requireScheduleDeleter(schedule, 'alice')).not.toThrow();
  });

  test('throws with correct message when not authorized', () => {
    const schedule = makeSchedule({ scheduleId: 'sched-99', creatorId: 'alice', agentId: 'bob' });
    expect(() => requireScheduleDeleter(schedule, 'bob')).toThrow(
      'Not authorized to delete schedule: sched-99',
    );
  });

  test('does not throw for self-created schedule', () => {
    const schedule = makeSchedule({ creatorId: null, agentId: 'self-agent' });
    expect(() => requireScheduleDeleter(schedule, 'self-agent')).not.toThrow();
  });
});


// ── forgeDebug tripwire (sub-pattern 3d) ────────────────────────────────────
// Regression: a copy-paste artifact caused both requireScheduleEditor and
// requireScheduleDeleter to log a message starting with the nonexistent
// function name "checkScheduleAuthorization". These tests assert the log
// message contains the actual function name, so the typo can't return.

describe('forgeDebug tripwire (sub-pattern 3d regression)', () => {
  beforeEach(() => {
    mockedForgeDebug.mockClear();
  });

  test('requireScheduleEditor logs the actual function name', () => {
    const schedule = makeSchedule({ scheduleId: 'sched-ed', creatorId: 'alice', agentId: 'bob' });
    expect(() => requireScheduleEditor(schedule, 'bob')).toThrow();
    expect(mockedForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'manager-auth',
        message: expect.stringContaining('requireScheduleEditor'),
      }),
    );
  });

  test('requireScheduleEditor log message does NOT reference the dead function name', () => {
    const schedule = makeSchedule({ scheduleId: 'sched-ed2', creatorId: 'alice', agentId: 'bob' });
    expect(() => requireScheduleEditor(schedule, 'bob')).toThrow();
    const call = mockedForgeDebug.mock.calls[0]?.[0] as { message?: string } | undefined;
    expect(call?.message).not.toContain('checkScheduleAuthorization');
  });

  test('requireScheduleDeleter logs the actual function name', () => {
    const schedule = makeSchedule({ scheduleId: 'sched-de', creatorId: 'alice', agentId: 'bob' });
    expect(() => requireScheduleDeleter(schedule, 'bob')).toThrow();
    expect(mockedForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: 'manager-auth',
        message: expect.stringContaining('requireScheduleDeleter'),
      }),
    );
  });

  test('requireScheduleDeleter log message does NOT reference the dead function name', () => {
    const schedule = makeSchedule({ scheduleId: 'sched-de2', creatorId: 'alice', agentId: 'bob' });
    expect(() => requireScheduleDeleter(schedule, 'bob')).toThrow();
    const call = mockedForgeDebug.mock.calls[0]?.[0] as { message?: string } | undefined;
    expect(call?.message).not.toContain('checkScheduleAuthorization');
  });
});
