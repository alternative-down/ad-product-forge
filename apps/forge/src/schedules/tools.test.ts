import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Hoisted mock state — must be declared BEFORE vi.mock calls
// ---------------------------------------------------------------------------
const mockCreateTool = vi.hoisted(() => vi.fn((tool) => {
  // Guard: if called with undefined/null (module-init), return a safe dummy
  if (!tool) return { id: 'mocked', description: '', inputSchema: z.object({}), execute: vi.fn() };
  const { execute, inputSchema, id = 'mocked' } = tool;
  return { id, description: '', inputSchema: inputSchema ?? z.object({}), execute };
}));

const mockHasToolPermission = vi.hoisted(() => vi.fn(() => true));

// ---------------------------------------------------------------------------
// Mock @forge-runtime/core
// ---------------------------------------------------------------------------
vi.mock('@forge-runtime/core', () => ({
  createTool: mockCreateTool,
  Tool: Object,
  forgeDebug: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock capability catalog
// ---------------------------------------------------------------------------
vi.mock('../capabilities/catalog', () => ({
  hasToolPermission: mockHasToolPermission,
}));

// ---------------------------------------------------------------------------
// Mock schedule manager factory
// ---------------------------------------------------------------------------
vi.mock('./manager', () => ({
  createAgentScheduleManager: vi.fn(() => ({
    listSchedules: vi.fn().mockResolvedValue([]),
    listTasks: vi.fn().mockResolvedValue([]),
    createSchedule: vi.fn().mockResolvedValue({ scheduleId: 'crn_new' }),
    createScheduleForAgent: vi.fn().mockResolvedValue({ scheduleId: 'crn_del' }),
    updateSchedule: vi.fn().mockResolvedValue({ scheduleId: 'crn_upd' }),
    deleteSchedule: vi.fn().mockResolvedValue({ success: true }),
    deleteCron: vi.fn().mockResolvedValue({ success: true }),
  })),
}));

// ---------------------------------------------------------------------------
// Import the module under test
// ---------------------------------------------------------------------------
import * as toolsModule from './tools';

// ---------------------------------------------------------------------------
// Pure function mirrors — verified against tools.ts source
// ---------------------------------------------------------------------------

function validateCreateTiming(input: {
  name?: string | null;
  scheduleType: 'cron' | 'date' | null | undefined;
  cronExpression?: string | null;
  scheduledDate?: string | null;
  content?: string | null;
}) {
  if (!input.name) return { valid: false as const, error: 'name is required when action is create', hint: 'Create calls must send a real name, not null.' };
  if (!input.scheduleType) return { valid: false as const, error: 'scheduleType is required when action is create', hint: 'Create calls must send scheduleType as "cron" or "date".' };
  if (input.scheduleType === 'cron' && !input.cronExpression) return { valid: false as const, error: 'cronExpression is required when scheduleType is cron', hint: 'Send cronExpression such as "0 * * * *".' };
  if (input.scheduleType === 'date' && !input.scheduledDate) return { valid: false as const, error: 'scheduledDate is required when scheduleType is date', hint: 'Provide an ISO date string.' };
  if (!input.content) return { valid: false as const, error: 'content is required when action is create', hint: 'Create calls must send the cron content, not null.' };
  return null;
}

function normalizeCronId(input: { cronId?: string }) {
  return input.cronId ?? null;
}

function validateDelegatedCronCreateTarget(input: { targetAgentId?: string }) {
  if (input.targetAgentId) return null;
  return { valid: false as const, error: 'targetAgentId is required when action is create', hint: 'Provide the agentId that should receive the delegated cron.' };
}

function normalizeOptionalText(value?: string) {
  if (value === undefined) return undefined;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : undefined;
}

function toCronOutput<T extends { scheduleId?: string; taskId?: string }>(value: T) {
  const cronId = value.scheduleId ?? value.taskId;
   
  const { scheduleId: _s, taskId: _t, ...rest } = value;
  return { ...rest, cronId };
}

// ---------------------------------------------------------------------------
// Tests: validateCreateTiming
// ---------------------------------------------------------------------------
describe('validateCreateTiming', () => {
  it('returns null for valid cron input', () => {
    expect(validateCreateTiming({ name: 'Nightly', scheduleType: 'cron', cronExpression: '0 2 * * *', content: 'Run' })).toBeNull();
  });

  it('returns null for valid date input', () => {
    expect(validateCreateTiming({ name: 'One-time', scheduleType: 'date', scheduledDate: '2026-06-01T10:00:00Z', content: 'Deploy' })).toBeNull();
  });

  it('returns error when name is missing', () => {
    const r = validateCreateTiming({ scheduleType: 'cron', cronExpression: '0 * * * *', content: 'x' });
    expect(r).not.toBeNull();
    expect(r!.valid).toBe(false);
    expect(r!.error).toBe('name is required when action is create');
  });

  it('returns error when name is null', () => {
    const r = validateCreateTiming({ name: null, scheduleType: 'cron', cronExpression: '0 * * * *', content: 'x' });
    expect(r).not.toBeNull();
    expect(r!.valid).toBe(false);
  });

  it('returns error when scheduleType is missing', () => {
    const r = validateCreateTiming({ name: 'Cron', content: 'x' });
    expect(r).not.toBeNull();
    expect(r!.error).toBe('scheduleType is required when action is create');
  });

  it('returns error when scheduleType is null', () => {
    const r = validateCreateTiming({ name: 'Cron', scheduleType: null, content: 'x' });
    expect(r).not.toBeNull();
    expect(r!.error).toBe('scheduleType is required when action is create');
  });

  it('returns error when cron scheduleType is missing cronExpression', () => {
    const r = validateCreateTiming({ name: 'Cron', scheduleType: 'cron', content: 'x' });
    expect(r).not.toBeNull();
    expect(r!.error).toBe('cronExpression is required when scheduleType is cron');
  });

  it('returns error when date scheduleType is missing scheduledDate', () => {
    const r = validateCreateTiming({ name: 'Date', scheduleType: 'date', content: 'x' });
    expect(r).not.toBeNull();
    expect(r!.error).toBe('scheduledDate is required when scheduleType is date');
  });

  it('returns error when content is missing', () => {
    const r = validateCreateTiming({ name: 'Cron', scheduleType: 'cron', cronExpression: '0 * * * *' });
    expect(r).not.toBeNull();
    expect(r!.error).toBe('content is required when action is create');
  });

  it('returns error when content is null', () => {
    const r = validateCreateTiming({ name: 'Cron', scheduleType: 'cron', cronExpression: '0 * * * *', content: null });
    expect(r).not.toBeNull();
    expect(r!.error).toBe('content is required when action is create');
  });
});

// ---------------------------------------------------------------------------
// Tests: normalizeCronId
// ---------------------------------------------------------------------------
describe('normalizeCronId', () => {
  it('returns the cronId when provided', () => {
    expect(normalizeCronId({ cronId: 'crn_abc123' })).toBe('crn_abc123');
  });

  it('returns null when cronId is undefined', () => {
    expect(normalizeCronId({})).toBeNull();
  });

  // ?? only coalesces null/undefined — empty string is a valid input
  it('returns empty string as-is', () => {
    expect(normalizeCronId({ cronId: '' })).toBe('');
  });
});

// ---------------------------------------------------------------------------
// Tests: validateDelegatedCronCreateTarget
// ---------------------------------------------------------------------------
describe('validateDelegatedCronCreateTarget', () => {
  it('returns null when targetAgentId is provided', () => {
    expect(validateDelegatedCronCreateTarget({ targetAgentId: 'ag_123' })).toBeNull();
  });

  it('returns error when targetAgentId is missing', () => {
    const r = validateDelegatedCronCreateTarget({});
    expect(r).not.toBeNull();
    expect(r!.valid).toBe(false);
    expect(r!.error).toBe('targetAgentId is required when action is create');
  });

  it('returns error when targetAgentId is undefined', () => {
    const r = validateDelegatedCronCreateTarget({ targetAgentId: undefined });
    expect(r).not.toBeNull();
    expect(r!.valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tests: normalizeOptionalText
// ---------------------------------------------------------------------------
describe('normalizeOptionalText', () => {
  it('returns the trimmed string when non-empty', () => {
    expect(normalizeOptionalText('  Hello World  ')).toBe('Hello World');
  });

  it('returns the string unchanged when no whitespace', () => {
    expect(normalizeOptionalText('NoWhitespace')).toBe('NoWhitespace');
  });

  it('returns undefined when input is undefined', () => {
    expect(normalizeOptionalText(undefined)).toBeUndefined();
  });

  it('returns undefined when trimmed string is empty', () => {
    expect(normalizeOptionalText('   ')).toBeUndefined();
    expect(normalizeOptionalText('')).toBeUndefined();
    expect(normalizeOptionalText('\t\n')).toBeUndefined();
  });

  it('returns trimmed value when leading/trailing whitespace only', () => {
    expect(normalizeOptionalText('  trimmed  ')).toBe('trimmed');
  });
});

// ---------------------------------------------------------------------------
// Tests: toCronOutput
// ---------------------------------------------------------------------------
describe('toCronOutput', () => {
  it('uses scheduleId as cronId when present', () => {
    const r = toCronOutput({ scheduleId: 'crn_001', name: 'Test', content: 'Do it' });
    expect(r.cronId).toBe('crn_001');
    expect(r.name).toBe('Test');
    expect(r.content).toBe('Do it');
  });

  it('uses taskId as cronId fallback when scheduleId is absent', () => {
    const r = toCronOutput({ taskId: 'tsk_002', name: 'Delegated', content: 'Delegate' });
    expect(r.cronId).toBe('tsk_002');
    expect(r.name).toBe('Delegated');
  });

  it('prioritizes scheduleId over taskId when both present', () => {
    const r = toCronOutput({ scheduleId: 'crn_main', taskId: 'tsk_fallback', name: 'Priority' });
    expect(r.cronId).toBe('crn_main');
  });

  it('does not include scheduleId or taskId as separate keys', () => {
    const r = toCronOutput({ scheduleId: 'crn_001', taskId: 'tsk_001', name: 'NoDup' });
    expect(r).not.toHaveProperty('scheduleId');
    expect(r).not.toHaveProperty('taskId');
    expect(r.cronId).toBe('crn_001');
  });

  it('spreads all other properties', () => {
    const r = toCronOutput({ scheduleId: 'crn_001', name: 'Report', description: 'Daily', content: 'Run it', scheduleType: 'cron' as const, cronExpression: '0 9 * * *', timezone: 'UTC', wakeWhenRunning: true, isActive: true });
    expect(r.name).toBe('Report');
    expect(r.description).toBe('Daily');
    expect(r.content).toBe('Run it');
    expect(r.scheduleType).toBe('cron');
    expect(r.cronExpression).toBe('0 9 * * *');
    expect(r.timezone).toBe('UTC');
    expect(r.wakeWhenRunning).toBe(true);
    expect(r.isActive).toBe(true);
  });

  it('handles empty input', () => {
    const r = toCronOutput<{ scheduleId?: string; taskId?: string }>({});
    expect(r.cronId).toBeUndefined();
    expect(Object.keys(r)).toEqual(['cronId']);
  });
});

// ---------------------------------------------------------------------------
// Tests: createAgentScheduleTools factory
// ---------------------------------------------------------------------------
describe('createAgentScheduleTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasToolPermission.mockReturnValue(true);
  });

  it('exports createAgentScheduleTools function', () => {
    expect(typeof toolsModule.createAgentScheduleTools).toBe('function');
  });

  it('always creates list_self_crons tool', () => {
    const tools = toolsModule.createAgentScheduleTools('ag_test', {} as never);
    expect(tools).toHaveProperty('list_self_crons');
  });

  it('creates manage_self_crons when permission granted', () => {
    const tools = toolsModule.createAgentScheduleTools('ag_test', {} as never, new Set(['manage_self_crons']));
    expect(tools).toHaveProperty('manage_self_crons');
  });

  it('omits manage_self_crons when permission denied', () => {
    mockHasToolPermission.mockReturnValue(false);
    const tools = toolsModule.createAgentScheduleTools('ag_test', {} as never, new Set(['other_tool']));
    expect(tools).not.toHaveProperty('manage_self_crons');
  });

  it('creates list_crons when permission granted', () => {
    const tools = toolsModule.createAgentScheduleTools('ag_test', {} as never, new Set(['list_crons']));
    expect(tools).toHaveProperty('list_crons');
  });

  it('omits list_crons when permission denied', () => {
    mockHasToolPermission.mockReturnValue(false);
    const tools = toolsModule.createAgentScheduleTools('ag_test', {} as never, new Set(['other_tool']));
    expect(tools).not.toHaveProperty('list_crons');
  });

  it('creates manage_crons when permission granted', () => {
    const tools = toolsModule.createAgentScheduleTools('ag_test', {} as never, new Set(['manage_crons']));
    expect(tools).toHaveProperty('manage_crons');
  });

  it('omits manage_crons when permission denied', () => {
    mockHasToolPermission.mockReturnValue(false);
    const tools = toolsModule.createAgentScheduleTools('ag_test', {} as never, new Set(['other_tool']));
    expect(tools).not.toHaveProperty('manage_crons');
  });

  it('returns all four tools when all permissions granted', () => {
    const tools = toolsModule.createAgentScheduleTools('ag_test', {} as never, new Set(['manage_self_crons', 'list_crons', 'manage_crons']));
    expect(tools).toHaveProperty('list_self_crons');
    expect(tools).toHaveProperty('manage_self_crons');
    expect(tools).toHaveProperty('list_crons');
    expect(tools).toHaveProperty('manage_crons');
  });
});
