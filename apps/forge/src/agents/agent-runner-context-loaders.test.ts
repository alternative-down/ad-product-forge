/**
 * Unit tests for agents/agent-runner-context-loaders.ts.
 *
 * Tests the 3 exported async functions:
 * - loadActiveScheduleSummary
 * - loadAgentContextContent
 * - loadAgentContextInstructions
 *
 * These load workspace context and schedule summaries for the agent runner.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AGENT_CONTEXT_FILE_PATH, AGENT_CONTEXT_WARNING_CHAR_LIMIT } from '../utils/constants';

// ─── Test module imports ──────────────────────────────────────────────────────
// The module is marked unused-file but is loaded by agent-runner.ts.
// We import from the compiled output path to test the actual logic.
import * as loaders from './agent-runner-context-loaders';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeFilesystem(overrides: {
  exists?: (path: string) => Promise<boolean>;
  readFile?: (path: string) => Promise<string | Buffer | null>;
} = {}) {
  return {
    exists: overrides.exists ?? vi.fn<() => Promise<boolean>>(),
    readFile: overrides.readFile ?? vi.fn<() => Promise<string | Buffer | null>>(),
  };
}

function fakeDb(scheduleRows: Array<{ name: string | null; cronExpression: string | null; timezone: string | null }>) {
  return {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue(scheduleRows),
        }),
      }),
    }),
  };
}

// ─── Tests: loadActiveScheduleSummary ───────────────────────────────────────

describe('loadActiveScheduleSummary', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns null when no active schedules exist', async () => {
    const db = fakeDb([]);
    vi.useFakeTimers();
    const result = await loaders.loadActiveScheduleSummary(db as never, 'agent-1');
    expect(result).toBeNull();
  });

  it('returns formatted schedule lines when schedules exist', async () => {
    const db = fakeDb([
      { name: 'Morning cron', cronExpression: '0 9 * * *', timezone: 'America/New_York' },
      { name: null, cronExpression: '*/15 * * * *', timezone: 'UTC' },
    ]);
    const result = await loaders.loadActiveScheduleSummary(db as never, 'agent-1');
    expect(result).toContain('## Active Schedules');
    expect(result).toContain('Morning cron: "0 9 * * *" [America/New_York]');
    expect(result).toContain('(unnamed): "*/15 * * * *" [UTC]');
  });

  it('uses UTC as default timezone', async () => {
    const db = fakeDb([
      { name: 'Test', cronExpression: '0 * * * *', timezone: null },
    ]);
    const result = await loaders.loadActiveScheduleSummary(db as never, 'agent-1');
    expect(result).toContain('[UTC]');
  });

  it('returns null and logs on DB error', async () => {
    const db = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new Error('DB error')),
          }),
        }),
      }),
    };
    const result = await loaders.loadActiveScheduleSummary(db as never, 'agent-1');
    expect(result).toBeNull();
  });
});

// ─── Tests: loadAgentContextContent ──────────────────────────────────────────

describe('loadAgentContextContent', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns null when filesystem is absent', async () => {
    const result = await loaders.loadAgentContextContent(null as never);
    expect(result).toBeNull();
  });

  it('returns null when file does not exist', async () => {
    const fs = fakeFilesystem({ exists: async () => false });
    const result = await loaders.loadAgentContextContent(fs as never);
    expect(result).toBeNull();
  });

  it('returns null when file is empty', async () => {
    const fs = fakeFilesystem({
      exists: async () => true,
      readFile: async () => '   \n  \n  ',
    });
    const result = await loaders.loadAgentContextContent(fs as never);
    expect(result).toBeNull();
  });

  it('returns trimmed content when file exists and is non-empty', async () => {
    const fs = fakeFilesystem({
      exists: async () => true,
      readFile: async () => '  Hello world  \n  ',
    });
    const result = await loaders.loadAgentContextContent(fs as never);
    expect(result).toBe('Hello world');
  });

  it('handles Buffer data by decoding to UTF-8', async () => {
    const fs = fakeFilesystem({
      exists: async () => true,
      readFile: async () => Buffer.from('buffer content'),
    });
    const result = await loaders.loadAgentContextContent(fs as never);
    expect(result).toBe('buffer content');
  });

  it('adds warning header when content exceeds char limit', async () => {
    const longContent = 'x'.repeat(AGENT_CONTEXT_WARNING_CHAR_LIMIT + 100);
    const fs = fakeFilesystem({
      exists: async () => true,
      readFile: async () => longContent,
    });
    const result = await loaders.loadAgentContextContent(fs as never);
    expect(result).toContain('Context pressure warning:');
    expect(result).toContain('`AGENT_CONTEXT.md` is getting large');
    expect(result).toContain(longContent);
  });

  it('returns content as-is when under char limit', async () => {
    const fs = fakeFilesystem({
      exists: async () => true,
      readFile: async () => 'short content',
    });
    const result = await loaders.loadAgentContextContent(fs as never);
    expect(result).toBe('short content');
  });

  it('returns null when readFile throws', async () => {
    const fs = fakeFilesystem({
      exists: async () => true,
      readFile: async () => { throw new Error('read error'); },
    });
    const result = await loaders.loadAgentContextContent(fs as never);
    expect(result).toBeNull();
  });
});

// ─── Tests: loadAgentContextInstructions ─────────────────────────────────────

describe('loadAgentContextInstructions', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns undefined when no schedule and no context file', async () => {
    const db = fakeDb([]);
    const fs = fakeFilesystem({ exists: async () => false });

    const runtime = {
      id: 'agent-1',
      workspace: { filesystem: fs },
    };

    const result = await loaders.loadAgentContextInstructions(runtime as never, db as never);
    expect(result).toBeUndefined();
  });

  it('includes schedule section when schedules exist', async () => {
    const db = fakeDb([{ name: 'Morning', cronExpression: '0 9 * * *', timezone: 'UTC' }]);
    const fs = fakeFilesystem({ exists: async () => false });

    const runtime = {
      id: 'agent-1',
      workspace: { filesystem: fs },
    };

    const result = await loaders.loadAgentContextInstructions(runtime as never, db as never);
    expect(result).toContain('Morning: "0 9 * * *" [UTC]');
  });

  it('includes context file content when file exists', async () => {
    const db = fakeDb([]);
    const fs = fakeFilesystem({
      exists: async () => true,
      readFile: async () => 'workspace context here',
    });

    const runtime = {
      id: 'agent-1',
      workspace: { filesystem: fs },
    };

    const result = await loaders.loadAgentContextInstructions(runtime as never, db as never);
    expect(result).toContain('workspace context here');
  });

  it('combines schedule summary and context file', async () => {
    const db = fakeDb([{ name: 'MySchedule', cronExpression: '0 9 * * *', timezone: 'UTC' }]);
    const fs = fakeFilesystem({
      exists: async () => true,
      readFile: async () => 'Context content',
    });

    const runtime = {
      id: 'agent-1',
      workspace: { filesystem: fs },
    };

    const result = await loaders.loadAgentContextInstructions(runtime as never, db as never);
    expect(result).toContain('MySchedule');
    expect(result).toContain('Context content');
  });

  it('uses only schedule summary when no context file exists', async () => {
    const db = fakeDb([{ name: 'SchedOnly', cronExpression: '1 * * * *', timezone: 'UTC' }]);
    const fs = fakeFilesystem({ exists: async () => false });

    const runtime = {
      id: 'agent-1',
      workspace: { filesystem: fs },
    };

    const result = await loaders.loadAgentContextInstructions(runtime as never, db as never);
    expect(result).toContain('SchedOnly');
    expect(result).not.toContain('workspace context');
  });
});