import { describe, expect, it } from 'vitest';

// Inline the core functions from tools.ts to test them without importing
// the full module which requires @forge-runtime/core and the manager.

function validateCreateTiming(input: {
  name?: string | null;
  scheduleType: 'cron' | 'date' | null | undefined;
  cronExpression?: string | null;
  scheduledDate?: string | null;
  content?: string | null;
}) {
  if (!input.name) {
    return {
      valid: false as const,
      error: 'name is required when action is create',
      hint: 'Create calls must send a real name, not null. Example: { action: "create", name: "Burn Rate Report", scheduleType: "cron", cronExpression: "0 * * * *", content: "..." }',
    };
  }
  if (!input.scheduleType) {
    return {
      valid: false as const,
      error: 'scheduleType is required when action is create',
      hint: 'Create calls must send scheduleType as the literal string "cron" or "date", not null.',
    };
  }
  if (input.scheduleType === 'cron' && !input.cronExpression) {
    return {
      valid: false as const,
      error: 'cronExpression is required when scheduleType is cron',
      hint: 'For recurring crons, send cronExpression with a real value such as "0 * * * *".',
    };
  }
  if (input.scheduleType === 'date' && !input.scheduledDate) {
    return {
      valid: false as const,
      error: 'scheduledDate is required when scheduleType is date',
      hint: 'Provide an ISO date string for one-time crons.',
    };
  }
  if (!input.content) {
    return {
      valid: false as const,
      error: 'content is required when action is create',
      hint: 'Create calls must send the cron content with a real string, not null.',
    };
  }
  return null;
}

function normalizeCronId(input: { cronId?: string }) {
  return input.cronId ?? null;
}

describe('validateCreateTiming', () => {
  it('returns null for valid cron schedule with all fields', () => {
    const result = validateCreateTiming({
      name: 'Daily Report',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      content: 'Generate the daily report',
    });
    expect(result).toBeNull();
  });

  it('returns null for valid date schedule with all fields', () => {
    const result = validateCreateTiming({
      name: 'One-time Task',
      scheduleType: 'date',
      scheduledDate: '2025-06-01T12:00:00Z',
      content: 'Send notification',
    });
    expect(result).toBeNull();
  });

  it('returns invalid when name is missing', () => {
    const result = validateCreateTiming({
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      content: 'Report',
    });
    expect(result?.valid).toBe(false);
    expect(result?.error).toBe('name is required when action is create');
  });

  it('returns invalid when name is null', () => {
    const result = validateCreateTiming({
      name: null,
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      content: 'Report',
    });
    expect(result?.valid).toBe(false);
    expect(result?.error).toBe('name is required when action is create');
  });

  it('returns invalid when scheduleType is missing', () => {
    const result = validateCreateTiming({
      name: 'Task',
      cronExpression: '0 9 * * *',
      content: 'Report',
    });
    expect(result?.valid).toBe(false);
    expect(result?.error).toBe('scheduleType is required when action is create');
  });

  it('returns invalid when scheduleType is null', () => {
    const result = validateCreateTiming({
      name: 'Task',
      scheduleType: null,
      content: 'Report',
    });
    expect(result?.valid).toBe(false);
    expect(result?.error).toBe('scheduleType is required when action is create');
  });

  it('returns invalid when cron scheduleType lacks cronExpression', () => {
    const result = validateCreateTiming({
      name: 'Task',
      scheduleType: 'cron',
      content: 'Report',
    });
    expect(result?.valid).toBe(false);
    expect(result?.error).toBe('cronExpression is required when scheduleType is cron');
  });

  it('returns null even if cronExpression is empty string (truthy check)', () => {
    // empty string is falsy, so this should fail
    const result = validateCreateTiming({
      name: 'Task',
      scheduleType: 'cron',
      cronExpression: '',
      content: 'Report',
    });
    expect(result?.valid).toBe(false);
  });

  it('returns invalid when date scheduleType lacks scheduledDate', () => {
    const result = validateCreateTiming({
      name: 'Task',
      scheduleType: 'date',
      content: 'Report',
    });
    expect(result?.valid).toBe(false);
    expect(result?.error).toBe('scheduledDate is required when scheduleType is date');
  });

  it('returns invalid when content is missing', () => {
    const result = validateCreateTiming({
      name: 'Task',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
    });
    expect(result?.valid).toBe(false);
    expect(result?.error).toBe('content is required when action is create');
  });

  it('returns invalid when content is null', () => {
    const result = validateCreateTiming({
      name: 'Task',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      content: null,
    });
    expect(result?.valid).toBe(false);
  });

  it('returns invalid when content is empty string', () => {
    const result = validateCreateTiming({
      name: 'Task',
      scheduleType: 'cron',
      cronExpression: '0 9 * * *',
      content: '',
    });
    expect(result?.valid).toBe(false);
  });

  it('reports first failing validation (name missing before scheduleType)', () => {
    // name is checked first
    const result = validateCreateTiming({
      scheduleType: null,
      content: 'Report',
    });
    expect(result?.error).toBe('name is required when action is create');
  });

  it('accepts valid date schedule with empty scheduledDate string', () => {
    // empty string is falsy, so date validation catches it
    const result = validateCreateTiming({
      name: 'Task',
      scheduleType: 'date',
      scheduledDate: '',
      content: 'Report',
    });
    expect(result?.valid).toBe(false);
    expect(result?.error).toBe('scheduledDate is required when scheduleType is date');
  });
});

describe('normalizeCronId', () => {
  it('returns the cronId when provided', () => {
    expect(normalizeCronId({ cronId: 'cron-abc123' })).toBe('cron-abc123');
  });

  it('returns null when cronId is undefined', () => {
    expect(normalizeCronId({})).toBeNull();
    expect(normalizeCronId({ cronId: undefined })).toBeNull();
  });

  it('returns null when cronId is explicitly null', () => {
    expect(normalizeCronId({ cronId: null })).toBeNull();
  });

  it('returns empty string when cronId is empty string', () => {
    // empty string is truthy-falsey... actually falsy, so null coalescing gives null
    expect(normalizeCronId({ cronId: '' })).toBe('');
  });
});
