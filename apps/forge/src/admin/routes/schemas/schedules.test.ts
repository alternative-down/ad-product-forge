import { describe, it, expect } from 'vitest';
import { z } from 'zod';

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

describe('createScheduleSchema', () => {
  it('validates cron schedule with required fields', () => {
    const result = createScheduleSchema.parse({
      agentId: 'agent-1',
      name: 'daily-check',
      scheduleType: 'cron',
      cronExpression: '0 0 * * *',
      content: 'Run daily check',
    });
    expect(result.agentId).toBe('agent-1');
    expect(result.scheduleType).toBe('cron');
    expect(result.timezone).toBe('UTC');
  });

  it('validates date schedule', () => {
    const result = createScheduleSchema.parse({
      agentId: 'agent-1',
      name: 'one-time-task',
      scheduleType: 'date',
      scheduledDate: '2025-12-25T10:00:00Z',
      content: 'Run once',
    });
    expect(result.scheduleType).toBe('date');
  });

  it('accepts optional description', () => {
    const result = createScheduleSchema.parse({
      agentId: 'agent-1',
      name: 'task',
      scheduleType: 'cron',
      cronExpression: '0 0 * * *',
      content: 'content',
      description: 'My scheduled task',
    });
    expect(result.description).toBe('My scheduled task');
  });

  it('accepts custom timezone', () => {
    const result = createScheduleSchema.parse({
      agentId: 'agent-1',
      name: 'task',
      scheduleType: 'cron',
      cronExpression: '0 0 * * *',
      content: 'content',
      timezone: 'America/Sao_Paulo',
    });
    expect(result.timezone).toBe('America/Sao_Paulo');
  });

  it('accepts wakeWhenRunning option', () => {
    const result = createScheduleSchema.parse({
      agentId: 'agent-1',
      name: 'task',
      scheduleType: 'cron',
      cronExpression: '0 0 * * *',
      content: 'content',
      wakeWhenRunning: true,
    });
    expect(result.wakeWhenRunning).toBe(true);
  });

  it('rejects missing agentId', () => {
    expect(() => createScheduleSchema.parse({
      name: 'task',
      scheduleType: 'cron',
      cronExpression: '0 0 * * *',
      content: 'content',
    })).toThrow();
  });

  it('rejects missing name', () => {
    expect(() => createScheduleSchema.parse({
      agentId: 'agent-1',
      scheduleType: 'cron',
      cronExpression: '0 0 * * *',
      content: 'content',
    })).toThrow();
  });

  it('rejects missing scheduleType', () => {
    expect(() => createScheduleSchema.parse({
      agentId: 'agent-1',
      name: 'task',
      content: 'content',
    })).toThrow();
  });

  it('rejects invalid scheduleType', () => {
    expect(() => createScheduleSchema.parse({
      agentId: 'agent-1',
      name: 'task',
      scheduleType: 'daily',
      content: 'content',
    })).toThrow();
  });

  it('rejects missing content', () => {
    expect(() => createScheduleSchema.parse({
      agentId: 'agent-1',
      name: 'task',
      scheduleType: 'cron',
      cronExpression: '0 0 * * *',
    })).toThrow();
  });

  it('rejects empty cronExpression', () => {
    expect(() => createScheduleSchema.parse({
      agentId: 'agent-1',
      name: 'task',
      scheduleType: 'cron',
      cronExpression: '',
      content: 'content',
    })).toThrow();
  });
});

describe('updateScheduleSchema', () => {
  it('validates update with required fields', () => {
    const result = updateScheduleSchema.parse({
      agentId: 'agent-1',
      scheduleId: 'schedule-1',
    });
    expect(result.agentId).toBe('agent-1');
    expect(result.scheduleId).toBe('schedule-1');
  });

  it('accepts optional fields for update', () => {
    const result = updateScheduleSchema.parse({
      agentId: 'agent-1',
      scheduleId: 'schedule-1',
      name: 'updated-name',
      description: 'Updated description',
      isActive: false,
    });
    expect(result.name).toBe('updated-name');
    expect(result.isActive).toBe(false);
  });

  it('accepts nullable description', () => {
    const result = updateScheduleSchema.parse({
      agentId: 'agent-1',
      scheduleId: 'schedule-1',
      description: null,
    });
    expect(result.description).toBe(null);
  });

  it('accepts nullable cronExpression', () => {
    const result = updateScheduleSchema.parse({
      agentId: 'agent-1',
      scheduleId: 'schedule-1',
      cronExpression: null,
    });
    expect(result.cronExpression).toBe(null);
  });

  it('accepts nullable scheduledDate', () => {
    const result = updateScheduleSchema.parse({
      agentId: 'agent-1',
      scheduleId: 'schedule-1',
      scheduledDate: null,
    });
    expect(result.scheduledDate).toBe(null);
  });

  it('rejects missing agentId', () => {
    expect(() => updateScheduleSchema.parse({
      scheduleId: 'schedule-1',
    })).toThrow();
  });

  it('rejects missing scheduleId', () => {
    expect(() => updateScheduleSchema.parse({
      agentId: 'agent-1',
    })).toThrow();
  });
});

describe('deleteScheduleSchema', () => {
  it('validates delete with required fields', () => {
    const result = deleteScheduleSchema.parse({
      agentId: 'agent-1',
      scheduleId: 'schedule-1',
    });
    expect(result.agentId).toBe('agent-1');
    expect(result.scheduleId).toBe('schedule-1');
  });

  it('rejects missing agentId', () => {
    expect(() => deleteScheduleSchema.parse({
      scheduleId: 'schedule-1',
    })).toThrow();
  });

  it('rejects missing scheduleId', () => {
    expect(() => deleteScheduleSchema.parse({
      agentId: 'agent-1',
    })).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() => deleteScheduleSchema.parse({
      agentId: '',
      scheduleId: 'schedule-1',
    })).toThrow();
  });

  it('rejects empty scheduleId', () => {
    expect(() => deleteScheduleSchema.parse({
      agentId: 'agent-1',
      scheduleId: '',
    })).toThrow();
  });
});
