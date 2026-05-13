import { describe, it, expect } from 'vitest';
import {
  buildScheduleUpdateInput,
  buildScheduleRollbackInput,
  type ExistingScheduleFields,
} from './schedule-normalize-helpers';

describe('buildScheduleUpdateInput', () => {
  it('uses parsed name and description when provided', () => {
    const result = buildScheduleUpdateInput(
      { name: 'New Name', description: 'New desc' },
      { scheduleType: 'cron', cronExpression: '0 9 * * *', scheduledDate: null, wakeWhenRunning: true },
    );
    expect(result.name).toBe('New Name');
    expect(result.description).toBe('New desc');
  });

  it('defaults name and description to null when not provided', () => {
    const result = buildScheduleUpdateInput(
      {},
      { scheduleType: 'cron', cronExpression: '0 9 * * *', scheduledDate: null, wakeWhenRunning: false },
    );
    expect(result.name).toBe(null);
    expect(result.description).toBe(null);
  });

  it('uses normalized schedule fields regardless of parsed values', () => {
    const result = buildScheduleUpdateInput(
      { scheduleType: 'should-be-ignored' } as any,
      { scheduleType: 'date', cronExpression: null, scheduledDate: 1700000000, wakeWhenRunning: false } as any,
    );
    expect(result.scheduleType).toBe('date');
    expect(result.cronExpression).toBe(null);
    expect(result.scheduledDate).toBe(1700000000);
    expect(result.wakeWhenRunning).toBe(false);
  });

  it('uses parsed timezone when provided', () => {
    const result = buildScheduleUpdateInput(
      { timezone: 'Europe/Lisbon' },
      { scheduleType: 'cron', cronExpression: '0 9 * * *', scheduledDate: null, wakeWhenRunning: true },
    );
    expect(result.timezone).toBe('Europe/Lisbon');
  });

  it('defaults timezone to null when not provided', () => {
    const result = buildScheduleUpdateInput(
      {},
      { scheduleType: 'cron', cronExpression: '0 9 * * *', scheduledDate: null, wakeWhenRunning: true },
    );
    expect(result.timezone).toBe(null);
  });

  it('uses parsed content when provided', () => {
    const result = buildScheduleUpdateInput(
      { content: 'Do the thing' },
      { scheduleType: 'date', cronExpression: null, scheduledDate: 1700000000, wakeWhenRunning: false } as any,
    );
    expect(result.content).toBe('Do the thing');
  });

  it('defaults content to null when not provided', () => {
    const result = buildScheduleUpdateInput(
      {},
      { scheduleType: 'cron', cronExpression: '0 9 * * *', scheduledDate: null, wakeWhenRunning: true },
    );
    expect(result.content).toBe(null);
  });

  it('passes through isActive from parsed input', () => {
    const active = buildScheduleUpdateInput({}, { scheduleType: 'cron', cronExpression: '0 9 * * *', scheduledDate: null, wakeWhenRunning: true });
    expect(active.isActive).toBe(undefined);

    const withActive = buildScheduleUpdateInput({ isActive: false }, { scheduleType: 'cron', cronExpression: '0 9 * * *', scheduledDate: null, wakeWhenRunning: true });
    expect(withActive.isActive).toBe(false);
  });
});

describe('buildScheduleRollbackInput', () => {
  const base: ExistingScheduleFields = {
    name: 'My Schedule',
    description: 'Original description',
    scheduleType: 'cron',
    cronExpression: '0 9 * * *',
    scheduledDate: null,
    timezone: 'UTC',
    content: 'Original content',
    wakeWhenRunning: true,
    isActive: true,
  };

  it('copies all fields from the existing schedule', () => {
    const result = buildScheduleRollbackInput(base);
    expect(result).toEqual({
      name: 'My Schedule',
      description: 'Original description',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      scheduledDate: null,
      timezone: 'UTC',
      content: 'Original content',
      wakeWhenRunning: true,
      isActive: true,
    });
  });

  it('handles null description and content', () => {
    const result = buildScheduleRollbackInput({ ...base, description: null, content: null });
    expect(result.description).toBe(null);
    expect(result.content).toBe(null);
  });

  it('converts string scheduledDate to null via existing.scheduledDate', () => {
    const withDate = buildScheduleRollbackInput({ ...base, scheduledDate: '2024-11-15' });
    expect(withDate.scheduledDate).toBe('2024-11-15');
  });

  it('converts null cronExpression to null', () => {
    const withNull = buildScheduleRollbackInput({ ...base, cronExpression: null });
    expect(withNull.cronExpression).toBe(null);
  });

  it('preserves wakeWhenRunning and isActive flags', () => {
    const inactive = buildScheduleRollbackInput({ ...base, isActive: false, wakeWhenRunning: false });
    expect(inactive.isActive).toBe(false);
    expect(inactive.wakeWhenRunning).toBe(false);
  });
});
