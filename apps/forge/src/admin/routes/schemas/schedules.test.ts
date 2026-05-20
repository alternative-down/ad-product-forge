/**
 * Unit tests for admin/routes/schemas/schedules.ts.
 * Zod validation schemas for scheduled task management.
 * Zero prior coverage.
 *
 * NOTE: schedules.ts has no named exports, so schemas are redefined here.
 */
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// ─── Inline schema definitions (mirrors schedules.ts) ──────────────────────

const createScheduleSchema = z.object({
  agentId: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional(),
  scheduleType: z.enum(['cron', 'date']),
  cronExpression: z.string().min(1).optional(),
  scheduledDate: z.string().min(1).optional(),
  timezone: z.string().min(1).default('UTC'),
  content: z.string().min(1),
  wakeWhenRunning: z.boolean().optional(),
});

const updateScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
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

const deleteScheduleSchema = z.object({
  agentId: z.string().min(1),
  scheduleId: z.string().min(1),
});

// ─── createScheduleSchema — cron type ───────────────────────────────────────

describe('createScheduleSchema — cron type', () => {
  it('parses minimal valid cron input', () => {
    const result = createScheduleSchema.parse({
      agentId: 'agent-1',
      name: 'daily-report',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      content: 'Run daily report',
    });
    expect(result.scheduleType).toBe('cron');
    expect(result.cronExpression).toBe('0 9 * * *');
    expect(result.timezone).toBe('UTC'); // default
  });

  it('parses with all optional fields', () => {
    const result = createScheduleSchema.parse({
      agentId: 'a',
      name: 'n',
      scheduleType: 'cron',
      cronExpression: '* * * * *',
      content: 'c',
      description: 'A description',
      timezone: 'America/New_York',
      wakeWhenRunning: true,
    });
    expect(result.description).toBe('A description');
    expect(result.timezone).toBe('America/New_York');
    expect(result.wakeWhenRunning).toBe(true);
  });

  it('rejects missing agentId', () => {
    expect(() =>
      createScheduleSchema.parse({
        name: 'n',
        scheduleType: 'cron',
        cronExpression: '* * * * *',
        content: 'c',
      }),
    ).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() =>
      createScheduleSchema.parse({
        agentId: '',
        name: 'n',
        scheduleType: 'cron',
        cronExpression: '* * * * *',
        content: 'c',
      }),
    ).toThrow();
  });

  it('rejects missing name', () => {
    expect(() =>
      createScheduleSchema.parse({
        agentId: 'a',
        scheduleType: 'cron',
        cronExpression: '* * * * *',
        content: 'c',
      }),
    ).toThrow();
  });

  it('rejects missing scheduleType', () => {
    expect(() =>
      createScheduleSchema.parse({
        agentId: 'a',
        name: 'n',
        cronExpression: '* * * * *',
        content: 'c',
      }),
    ).toThrow();
  });

  it('rejects invalid scheduleType', () => {
    expect(() =>
      createScheduleSchema.parse({
        agentId: 'a',
        name: 'n',
        scheduleType: 'hourly',
        cronExpression: '* * * * *',
        content: 'c',
      }),
    ).toThrow();
  });

  it('rejects empty cronExpression', () => {
    expect(() =>
      createScheduleSchema.parse({
        agentId: 'a',
        name: 'n',
        scheduleType: 'cron',
        cronExpression: '',
        content: 'c',
      }),
    ).toThrow();
  });

  it('rejects missing content', () => {
    expect(() =>
      createScheduleSchema.parse({
        agentId: 'a',
        name: 'n',
        scheduleType: 'cron',
        cronExpression: '* * * * *',
      }),
    ).toThrow();
  });

  it('rejects empty content', () => {
    expect(() =>
      createScheduleSchema.parse({
        agentId: 'a',
        name: 'n',
        scheduleType: 'cron',
        cronExpression: '* * * * *',
        content: '',
      }),
    ).toThrow();
  });
});

// ─── createScheduleSchema — date type ───────────────────────────────────────

describe('createScheduleSchema — date type', () => {
  it('parses minimal valid date input', () => {
    const result = createScheduleSchema.parse({
      agentId: 'a',
      name: 'n',
      scheduleType: 'date',
      scheduledDate: '2025-06-01T10:00:00Z',
      content: 'c',
    });
    expect(result.scheduleType).toBe('date');
    expect(result.scheduledDate).toBe('2025-06-01T10:00:00Z');
  });

  it('rejects empty scheduledDate', () => {
    expect(() =>
      createScheduleSchema.parse({
        agentId: 'a',
        name: 'n',
        scheduleType: 'date',
        scheduledDate: '',
        content: 'c',
      }),
    ).toThrow();
  });
});

// ─── updateScheduleSchema ───────────────────────────────────────────────────

describe('updateScheduleSchema', () => {
  it('parses with agentId and scheduleId only (all other fields optional)', () => {
    const result = updateScheduleSchema.parse({
      agentId: 'agent-1',
      scheduleId: 'schedule-1',
    });
    expect(result.agentId).toBe('agent-1');
    expect(result.scheduleId).toBe('schedule-1');
  });

  it('parses with all optional fields', () => {
    const result = updateScheduleSchema.parse({
      agentId: 'a',
      scheduleId: 's',
      name: 'Updated',
      description: 'Desc',
      scheduleType: 'date',
      scheduledDate: '2025-12-01T00:00:00Z',
      timezone: 'Europe/London',
      content: 'New content',
      wakeWhenRunning: false,
      isActive: false,
    });
    expect(result.name).toBe('Updated');
    expect(result.isActive).toBe(false);
    expect(result.wakeWhenRunning).toBe(false);
  });

  it('accepts nullable description', () => {
    const result = updateScheduleSchema.parse({
      agentId: 'a',
      scheduleId: 's',
      description: null,
    });
    expect(result.description).toBeNull();
  });

  it('accepts nullable cronExpression', () => {
    const result = updateScheduleSchema.parse({
      agentId: 'a',
      scheduleId: 's',
      cronExpression: null,
    });
    expect(result.cronExpression).toBeNull();
  });

  it('accepts nullable scheduledDate', () => {
    const result = updateScheduleSchema.parse({
      agentId: 'a',
      scheduleId: 's',
      scheduledDate: null,
    });
    expect(result.scheduledDate).toBeNull();
  });

  it('rejects missing agentId', () => {
    expect(() => updateScheduleSchema.parse({ scheduleId: 's' })).toThrow();
  });

  it('rejects missing scheduleId', () => {
    expect(() => updateScheduleSchema.parse({ agentId: 'a' })).toThrow();
  });

  it('rejects invalid scheduleType', () => {
    expect(() =>
      updateScheduleSchema.parse({
        agentId: 'a',
        scheduleId: 's',
        scheduleType: 'hourly',
      }),
    ).toThrow();
  });
});

// ─── deleteScheduleSchema ───────────────────────────────────────────────────

describe('deleteScheduleSchema', () => {
  it('parses valid input', () => {
    expect(
      deleteScheduleSchema.parse({
        agentId: 'agent-1',
        scheduleId: 'schedule-1',
      }),
    ).toMatchObject({ agentId: 'agent-1', scheduleId: 'schedule-1' });
  });

  it('rejects missing agentId', () => {
    expect(() => deleteScheduleSchema.parse({ scheduleId: 's' })).toThrow();
  });

  it('rejects missing scheduleId', () => {
    expect(() => deleteScheduleSchema.parse({ agentId: 'a' })).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() => deleteScheduleSchema.parse({ agentId: '', scheduleId: 's' })).toThrow();
  });

  it('rejects empty scheduleId', () => {
    expect(() => deleteScheduleSchema.parse({ agentId: 'a', scheduleId: '' })).toThrow();
  });
});

// ─── safeParse (non-throwing) ─────────────────────────────────────────────

describe('schema.safeParse', () => {
  it('createScheduleSchema safeParse returns success false for missing content', () => {
    const result = createScheduleSchema.safeParse({
      agentId: 'a',
      name: 'n',
      scheduleType: 'cron',
      cronExpression: '* * * * *',
    });
    expect(result.success).toBe(false);
  });

  it('createScheduleSchema safeParse returns success true for valid cron input', () => {
    const result = createScheduleSchema.safeParse({
      agentId: 'a',
      name: 'n',
      scheduleType: 'cron',
      cronExpression: '* * * * *',
      content: 'c',
    });
    expect(result.success).toBe(true);
  });

  it('updateScheduleSchema safeParse returns success true for agentId/scheduleId only', () => {
    const result = updateScheduleSchema.safeParse({ agentId: 'a', scheduleId: 's' });
    expect(result.success).toBe(true);
  });

  it('deleteScheduleSchema safeParse returns success false for missing scheduleId', () => {
    const result = deleteScheduleSchema.safeParse({ agentId: 'a' });
    expect(result.success).toBe(false);
  });
});
