/**
 * Unit tests for admin/routes/schemas/schedules.ts.
 * Zod validation schemas for scheduled task management.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { createScheduleSchema, deleteScheduleSchema, updateScheduleSchema } from './schedules';


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

// ─── createScheduleSchema — discriminated union (rejects invalid combinations) [#5560] ────
//
// Tripwire: before the fix, createScheduleSchema was a plain z.object that
// accepted {scheduleType: 'cron', scheduledDate: '...', no cronExpression}.
// The bug only surfaced at runtime when the manager called .parse() again.
// The discriminated union rejects these at the route boundary.

describe('createScheduleSchema — discriminated union [#5560]', () => {
  it('rejects cron branch when scheduledDate is provided (must use date branch)', () => {
    const result = createScheduleSchema.safeParse({
      agentId: 'a',
      name: 'n',
      scheduleType: 'cron',
      scheduledDate: '2025-06-01T10:00:00Z',
      content: 'c',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // The issue's specific bug: scheduledDate leaked into cron branch.
      // zod's error must mention the offending path.
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('scheduledDate');
    }
  });

  it('rejects date branch when cronExpression is provided (must use cron branch)', () => {
    const result = createScheduleSchema.safeParse({
      agentId: 'a',
      name: 'n',
      scheduleType: 'date',
      cronExpression: '0 9 * * *',
      scheduledDate: '2025-06-01T10:00:00Z',
      content: 'c',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join('.'));
      expect(paths).toContain('cronExpression');
    }
  });

  it('rejects cron branch when both cronExpression and scheduledDate are missing', () => {
    const result = createScheduleSchema.safeParse({
      agentId: 'a',
      name: 'n',
      scheduleType: 'cron',
      content: 'c',
    });
    expect(result.success).toBe(false);
  });

  it('rejects date branch when scheduledDate is missing', () => {
    const result = createScheduleSchema.safeParse({
      agentId: 'a',
      name: 'n',
      scheduleType: 'date',
      content: 'c',
    });
    expect(result.success).toBe(false);
  });

  it('accepts cron branch with cronExpression and explicitly undefined scheduledDate', () => {
    // Mirrors the reference schema (schedules/tools/schemas.ts) which allows
    // explicit undefined on the wrong-branch field. This keeps the admin route
    // consistent with the existing tools-layer pattern.
    const result = createScheduleSchema.safeParse({
      agentId: 'a',
      name: 'n',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      scheduledDate: undefined,
      content: 'c',
    });
    expect(result.success).toBe(true);
  });

  it('accepts date branch with scheduledDate and explicitly undefined cronExpression', () => {
    const result = createScheduleSchema.safeParse({
      agentId: 'a',
      name: 'n',
      scheduleType: 'date',
      scheduledDate: '2025-06-01T10:00:00Z',
      cronExpression: undefined,
      content: 'c',
    });
    expect(result.success).toBe(true);
  });

  it('is a z.discriminatedUnion (locks the shape — prevents regression to plain z.object)', () => {
    // Snapshot-style assertion: zod's discriminatedUnion exposes
    // { discriminator, options } on its .def. A plain z.object does not
    // have these fields. This locks the schema's structure so future
    // 'simplifications' don't silently reintroduce #5560.
    const def = (
      createScheduleSchema as unknown as {
        def: { discriminator?: string; options?: ReadonlyArray<unknown> };
      }
    ).def;
    expect(def.discriminator).toBe('scheduleType');
    expect(def.options).toHaveLength(2);
  });
});
