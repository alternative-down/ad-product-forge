/**
 * Unit tests for schedules/schemas.ts.
 * All exported schema definitions and type exports.
 * Covers only public (exported) schemas.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import {
  createScheduleSchema,
  createScheduleForAgentSchema,
  updateScheduleSchema,
  type CreateScheduleInput,
  type CreateScheduleForAgentInput,
  type UpdateScheduleInput,
} from './schemas';

// ─── createScheduleSchema — cron variant ───────────────────────────────────

describe('createScheduleSchema — cron variant', () => {
  it('accepts valid cron schedule', () => {
    const input = {
      scheduleType: 'cron',
      name: 'Every hour',
      cronExpression: '0 * * * *',
      content: 'Run cleanup task',
      timezone: 'UTC',
    };
    expect(createScheduleSchema.parse(input)).toMatchObject({
      scheduleType: 'cron',
      name: 'Every hour',
      cronExpression: '0 * * * *',
    });
  });

  it('rejects cron schedule when cronExpression missing', () => {
    const input = {
      scheduleType: 'cron',
      name: 'Test',
      content: 'hello',
    } as CreateScheduleInput;
    expect(() => createScheduleSchema.parse(input)).toThrow();
  });

  it('rejects cron schedule when content missing', () => {
    const input = {
      scheduleType: 'cron',
      name: 'Test',
      cronExpression: '0 * * * *',
    } as CreateScheduleInput;
    expect(() => createScheduleSchema.parse(input)).toThrow();
  });

  it('rejects cron schedule when name is empty string', () => {
    const input = {
      scheduleType: 'cron',
      name: '',
      cronExpression: '0 * * * *',
      content: 'hello',
    };
    expect(() => createScheduleSchema.parse(input)).toThrow();
  });

  it('accepts optional description and wakeWhenRunning', () => {
    const input = {
      scheduleType: 'cron',
      name: 'Task',
      cronExpression: '0 9 * * *',
      content: 'Morning task',
      description: 'Run every morning',
      wakeWhenRunning: false,
    };
    const result = createScheduleSchema.parse(input) as CreateScheduleInput;
    expect(result.description).toBe('Run every morning');
    expect(result.wakeWhenRunning).toBe(false);
  });

  it('timezone defaults to UTC', () => {
    const input = {
      scheduleType: 'cron',
      name: 'Task',
      cronExpression: '0 * * * *',
      content: 'hello',
    };
    const result = createScheduleSchema.parse(input) as CreateScheduleInput;
    expect(result.timezone).toBe('UTC');
  });
});

// ─── createScheduleSchema — date variant ────────────────────────────────────

describe('createScheduleSchema — date variant', () => {
  it('accepts valid date schedule', () => {
    const input = {
      scheduleType: 'date',
      name: 'One-time task',
      scheduledDate: '2025-06-01T09:00:00Z',
      content: 'Send report',
    };
    expect(createScheduleSchema.parse(input)).toMatchObject({
      scheduleType: 'date',
      name: 'One-time task',
    });
  });

  it('rejects date schedule when scheduledDate missing', () => {
    const input = {
      scheduleType: 'date',
      name: 'Test',
      content: 'hello',
    } as CreateScheduleInput;
    expect(() => createScheduleSchema.parse(input)).toThrow();
  });

  it('timezone defaults to UTC', () => {
    const input = {
      scheduleType: 'date',
      name: 'Task',
      scheduledDate: '2025-06-01T09:00:00Z',
      content: 'hello',
    };
    const result = createScheduleSchema.parse(input) as CreateScheduleInput;
    expect(result.timezone).toBe('UTC');
  });
});

// ─── createScheduleSchema — discriminator ───────────────────────────────────

describe('createScheduleSchema — discriminated union', () => {
  it('rejects unknown scheduleType', () => {
    const input = {
      scheduleType: 'unknown',
      name: 'Test',
      content: 'hello',
    };
    expect(() => createScheduleSchema.parse(input)).toThrow();
  });

  it('rejects schedule missing scheduleType', () => {
    const input = { name: 'Test', content: 'hello' } as CreateScheduleInput;
    expect(() => createScheduleSchema.parse(input)).toThrow();
  });

  it('accepts both cron and date variants via discriminatedUnion', () => {
    const cron = {
      scheduleType: 'cron',
      name: 'Cron Task',
      cronExpression: '0 * * * *',
      content: 'check',
    };
    const date = {
      scheduleType: 'date',
      name: 'Date Task',
      scheduledDate: '2025-06-01T09:00:00Z',
      content: 'check',
    };
    expect(createScheduleSchema.parse(cron).scheduleType).toBe('cron');
    expect(createScheduleSchema.parse(date).scheduleType).toBe('date');
  });
});

// ─── createScheduleForAgentSchema ───────────────────────────────────────────

describe('createScheduleForAgentSchema — cron variant', () => {
  it('accepts valid cross-agent cron schedule with targetAgentId', () => {
    const input = {
      scheduleType: 'cron',
      name: 'Agent task',
      targetAgentId: 'agent-abc',
      cronExpression: '0 * * * *',
      content: 'Check status',
    };
    expect(createScheduleForAgentSchema.parse(input)).toMatchObject({
      scheduleType: 'cron',
      targetAgentId: 'agent-abc',
    });
  });

  it('rejects when targetAgentId missing', () => {
    const input = {
      scheduleType: 'cron',
      name: 'Task',
      cronExpression: '0 * * * *',
      content: 'hello',
    } as CreateScheduleForAgentInput;
    expect(() => createScheduleForAgentSchema.parse(input)).toThrow();
  });
});

describe('createScheduleForAgentSchema — date variant', () => {
  it('accepts valid cross-agent date schedule', () => {
    const input = {
      scheduleType: 'date',
      name: 'One-time',
      targetAgentId: 'agent-xyz',
      scheduledDate: '2025-07-01T12:00:00Z',
      content: 'Deliver report',
    };
    const result = createScheduleForAgentSchema.parse(input) as CreateScheduleForAgentInput;
    expect(result.targetAgentId).toBe('agent-xyz');
    expect(result.scheduleType).toBe('date');
  });
});

// ─── updateScheduleSchema ────────────────────────────────────────────────────

describe('updateScheduleSchema', () => {
  it('accepts empty object (all fields optional)', () => {
    expect(updateScheduleSchema.parse({})).toMatchObject({});
  });

  it('accepts partial update — name only', () => {
    const result = updateScheduleSchema.parse({ name: 'New name' }) as UpdateScheduleInput;
    expect(result.name).toBe('New name');
  });

  it('accepts partial update — timezone only', () => {
    const result = updateScheduleSchema.parse({ timezone: 'America/New_York' }) as UpdateScheduleInput;
    expect(result.timezone).toBe('America/New_York');
  });

  it('accepts scheduleType and cronExpression together', () => {
    const input = {
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
    } as UpdateScheduleInput;
    expect(updateScheduleSchema.parse(input)).toMatchObject({
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
    });
  });

  it('accepts scheduleType date with scheduledDate', () => {
    const input = {
      scheduleType: 'date',
      scheduledDate: '2025-08-01T08:00:00Z',
    } as UpdateScheduleInput;
    const result = updateScheduleSchema.parse(input);
    expect(result.scheduleType).toBe('date');
  });

  it('accepts isActive toggle', () => {
    const result = updateScheduleSchema.parse({ isActive: false }) as UpdateScheduleInput;
    expect(result.isActive).toBe(false);
  });

  it('accepts null for nullable fields (description, cronExpression, scheduledDate)', () => {
    const result = updateScheduleSchema.parse({
      description: null,
      cronExpression: null,
      scheduledDate: null,
    }) as UpdateScheduleInput;
    expect(result.description).toBeNull();
    expect(result.cronExpression).toBeNull();
    expect(result.scheduledDate).toBeNull();
  });

  it('rejects name as empty string (min(1))', () => {
    expect(() => updateScheduleSchema.parse({ name: '' })).toThrow();
  });
});