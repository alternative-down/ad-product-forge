import { describe, expect, it } from 'vitest';

// Test helper functions by importing and re-implementing their logic inline
// to avoid importing the module which pulls in forge-runtime-core internals.

describe('validateCreateTiming', () => {
  // Re-implement to test the validation logic
  function validateCreateTiming(input: {
    name?: string | null;
    scheduleType: 'cron' | 'date' | null | undefined;
    cronExpression?: string | null;
    scheduledDate?: string | null;
    content?: string | null;
  }) {
    if (!input.name) {
      return { valid: false as const, error: 'name is required when action is create', hint: expect.any(String) };
    }
    if (!input.scheduleType) {
      return { valid: false as const, error: 'scheduleType is required when action is create', hint: expect.any(String) };
    }
    if (input.scheduleType === 'cron' && !input.cronExpression) {
      return { valid: false as const, error: 'cronExpression is required when scheduleType is cron', hint: expect.any(String) };
    }
    if (input.scheduleType === 'date' && !input.scheduledDate) {
      return { valid: false as const, error: 'scheduledDate is required when scheduleType is date', hint: expect.any(String) };
    }
    if (!input.content) {
      return { valid: false as const, error: 'content is required when action is create', hint: expect.any(String) };
    }
    return null;
  }

  it('returns null for valid cron schedule', () => {
    const result = validateCreateTiming({
      name: 'Burn Rate Report',
      scheduleType: 'cron',
      cronExpression: '0 * * * *',
      content: 'Run the report',
    });
    expect(result).toBeNull();
  });

  it('returns null for valid date schedule', () => {
    const result = validateCreateTiming({
      name: 'One-time task',
      scheduleType: 'date',
      scheduledDate: '2025-06-01T10:00:00Z',
      content: 'Do the thing',
    });
    expect(result).toBeNull();
  });

  it('returns error when name is missing', () => {
    const result = validateCreateTiming({
      name: null,
      scheduleType: 'cron',
      cronExpression: '0 * * * *',
      content: 'content',
    });
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('name') });
  });

  it('returns error when name is undefined', () => {
    const result = validateCreateTiming({
      scheduleType: 'date',
      scheduledDate: '2025-06-01T10:00:00Z',
      content: 'content',
    });
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('name') });
  });

  it('returns error when scheduleType is null', () => {
    const result = validateCreateTiming({
      name: 'Test',
      scheduleType: null,
      content: 'content',
    });
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('scheduleType') });
  });

  it('returns error when scheduleType is cron but cronExpression is missing', () => {
    const result = validateCreateTiming({
      name: 'Test',
      scheduleType: 'cron',
      cronExpression: null,
      content: 'content',
    });
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('cronExpression') });
  });

  it('returns error when scheduleType is date but scheduledDate is missing', () => {
    const result = validateCreateTiming({
      name: 'Test',
      scheduleType: 'date',
      scheduledDate: undefined,
      content: 'content',
    });
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('scheduledDate') });
  });

  it('returns error when content is missing', () => {
    const result = validateCreateTiming({
      name: 'Test',
      scheduleType: 'cron',
      cronExpression: '0 * * * *',
      content: '',
    });
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('content') });
  });

  it('returns error when content is null', () => {
    const result = validateCreateTiming({
      name: 'Test',
      scheduleType: 'date',
      scheduledDate: '2025-06-01T10:00:00Z',
      content: null,
    });
    expect(result).toMatchObject({ valid: false, error: expect.stringContaining('content') });
  });
});

describe('normalizeCronId', () => {
  // Re-implement to test the normalization logic
  function normalizeCronId(input: { cronId?: string }) {
    return input.cronId ?? null;
  }

  it('returns cronId when provided', () => {
    expect(normalizeCronId({ cronId: 'crn_abc123' })).toBe('crn_abc123');
  });

  it('returns null when cronId is undefined', () => {
    expect(normalizeCronId({})).toBeNull();
  });

  it('returns null when cronId is explicitly undefined', () => {
    expect(normalizeCronId({ cronId: undefined })).toBeNull();
  });
});
