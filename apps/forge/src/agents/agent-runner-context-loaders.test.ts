/**
 * Unit tests for agents/agent-runner-context-loaders.ts.
 * loadAgentContextInstructions, loadActiveScheduleSummary, loadAgentContextContent.
 * Zero prior coverage.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  loadAgentContextInstructions,
  loadActiveScheduleSummary,
  loadAgentContextContent,
} from './agent-runner-context-loaders';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeMockRuntime(content: string | null): {
  workspace: { filesystem: { exists: Function; readFile: Function } };
  id: string;
} {
  return {
    id: 'agent-123',
    workspace: {
      filesystem: {
        exists: vi.fn().mockResolvedValue(content !== null),
        readFile: vi.fn().mockResolvedValue(content),
      },
    },
  };
}

function makeMockDb(rows: Array<{ name: string | null; cronExpression: string | null; timezone: string | null }>): { select: Function; from: Function; where: Function; limit: Function } {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

// ─── loadAgentContextInstructions ───────────────────────────────────────────

describe('loadAgentContextInstructions', () => {
  it('returns undefined when both schedule and context are null', async () => {
    const runtime = makeMockRuntime(null);
    const db = makeMockDb([]);

    const result = await loadAgentContextInstructions(runtime as any, db as any);

    expect(result).toBeUndefined();
  });

  it('returns schedule summary only when context file absent', async () => {
    const runtime = makeMockRuntime(null);
    const db = makeMockDb([
      { name: 'hourly', cronExpression: '0 * * * *', timezone: 'UTC' },
    ]);

    const result = await loadAgentContextInstructions(runtime as any, db as any);

    expect(result).toContain('hourly');
    expect(result).toContain('0 * * * *');
  });

  it('returns context only when no schedules found', async () => {
    const runtime = makeMockRuntime('my agent context');
    const db = makeMockDb([]);

    const result = await loadAgentContextInstructions(runtime as any, db as any);

    expect(result).toContain('my agent context');
    expect(result).not.toContain('## Active Schedules');
  });

  it('joins schedule and context with double newline', async () => {
    const runtime = makeMockRuntime('workspace notes');
    const db = makeMockDb([
      { name: 'morning', cronExpression: '0 8 * * *', timezone: 'America/New_York' },
    ]);

    const result = await loadAgentContextInstructions(runtime as any, db as any);

    // result should have both sections separated by blank line
    expect(result).toContain('morning');
    expect(result).toContain('workspace notes');
    expect(result?.indexOf('## Active Schedules')).toBeLessThan(result?.indexOf('workspace notes') ?? -1);
  });

  it('uses schedule lines format: "  Name: "cron" [tz]"', async () => {
    const runtime = makeMockRuntime(null);
    const db = makeMockDb([
      { name: 'Cleanup', cronExpression: '0 0 * * *', timezone: 'UTC' },
    ]);

    const result = await loadAgentContextInstructions(runtime as any, db as any);

    expect(result).toContain('  Cleanup: "0 0 * * *" [UTC]');
  });
});

// ─── loadActiveScheduleSummary ───────────────────────────────────────────────

describe('loadActiveScheduleSummary — happy path', () => {
  it('returns null when no rows returned', async () => {
    const db = makeMockDb([]);

    const result = await loadActiveScheduleSummary(db as any, 'agent-123');

    expect(result).toBeNull();
  });

  it('formats schedule lines with name, cron, and timezone', async () => {
    const db = makeMockDb([
      { name: 'Morning', cronExpression: '0 7 * * *', timezone: 'UTC' },
      { name: 'Evening', cronExpression: '0 19 * * *', timezone: 'America/New_York' },
    ]);

    const result = await loadActiveScheduleSummary(db as any, 'agent-123');

    expect(result).toContain('  Morning: "0 7 * * *" [UTC]');
    expect(result).toContain('  Evening: "0 19 * * *" [America/New_York]');
  });

  it('uses UTC default when timezone is null', async () => {
    const db = makeMockDb([
      { name: 'Task', cronExpression: '0 * * * *', timezone: null },
    ]);

    const result = await loadActiveScheduleSummary(db as any, 'agent-123');

    expect(result).toContain('[UTC]');
  });

  it('uses empty string default when cronExpression is null', async () => {
    const db = makeMockDb([
      { name: 'Task', cronExpression: null, timezone: 'UTC' },
    ]);

    const result = await loadActiveScheduleSummary(db as any, 'agent-123');

    expect(result).toContain('Task: "" [UTC]');
  });

  it('uses "(unnamed)" when name is null', async () => {
    const db = makeMockDb([
      { name: null, cronExpression: '0 * * * *', timezone: 'UTC' },
    ]);

    const result = await loadActiveScheduleSummary(db as any, 'agent-123');

    expect(result).toContain('(unnamed)');
  });
});

describe('loadActiveScheduleSummary — error handling', () => {
  it('returns null on DB error (caught and logged)', async () => {
    const db = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockRejectedValue(new Error('db connection failed')),
    };

    const result = await loadActiveScheduleSummary(db as any, 'agent-123');

    expect(result).toBeNull();
  });
});

// ─── loadAgentContextContent ─────────────────────────────────────────────────

describe('loadAgentContextContent — no filesystem', () => {
  it('returns null when filesystem is falsy', async () => {
    const result = await loadAgentContextContent(null as any);

    expect(result).toBeNull();
  });

  it('returns null when filesystem.exists throws', async () => {
    const fakeFilesystem = {
      exists: vi.fn().mockRejectedValue(new Error('fs error')),
    };

    const result = await loadAgentContextContent(fakeFilesystem as any);

    expect(result).toBeNull();
  });
});

describe('loadAgentContextContent — file not found', () => {
  it('returns null when file does not exist', async () => {
    const fakeFilesystem = {
      exists: vi.fn().mockResolvedValue(false),
    };

    const result = await loadAgentContextContent(fakeFilesystem as any);

    expect(result).toBeNull();
  });
});

describe('loadAgentContextContent — file present', () => {
  it('returns trimmed content under AGENT_CONTEXT_WARNING_CHAR_LIMIT', async () => {
    const fakeFilesystem = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue('  my context content  '),
    };

    const result = await loadAgentContextContent(fakeFilesystem as any);

    expect(result).toBe('my context content');
  });

  it('returns null when file is empty after trim', async () => {
    const fakeFilesystem = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue('   \n   '),
    };

    const result = await loadAgentContextContent(fakeFilesystem as any);

    expect(result).toBeNull();
  });

  it('handles Buffer data by converting to utf8 string', async () => {
    const fakeFilesystem = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue(Buffer.from('buffer content', 'utf8')),
    };

    const result = await loadAgentContextContent(fakeFilesystem as any);

    expect(result).toBe('buffer content');
  });

  it('returns null when readFile throws (caught)', async () => {
    const fakeFilesystem = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockRejectedValue(new Error('read error')),
    };

    const result = await loadAgentContextContent(fakeFilesystem as any);

    expect(result).toBeNull();
  });

  it('adds pressure warning when content exceeds AGENT_CONTEXT_WARNING_CHAR_LIMIT', async () => {
    const longContent = 'x'.repeat(9000);
    const fakeFilesystem = {
      exists: vi.fn().mockResolvedValue(true),
      readFile: vi.fn().mockResolvedValue(longContent),
    };

    const result = await loadAgentContextContent(fakeFilesystem as any);

    expect(result).toContain('Context pressure warning');
    expect(result).toContain('is getting large');
    expect(result).toContain('AGENT_CONTEXT.md') || expect(result).toContain('AGENT_CONTEXT');
    expect(result).toContain(longContent);
  });
});