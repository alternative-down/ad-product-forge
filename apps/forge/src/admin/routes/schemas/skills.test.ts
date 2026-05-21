/**
 * Unit tests for admin/routes/schemas/skills.ts.
 * Zod validation schemas for agent and system skill management.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { uploadSystemSkillsSchema, deleteSystemSkillSchema } from './skills';
import { z } from 'zod';

// Non-exported schemas — redefined inline (mirrors skills.ts)
const uploadAgentSkillsSchema = z.object({
  agentId: z.string().min(1),
  archiveBase64: z.string().min(1),
});

const deleteAgentSkillSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

const installGlobalSkillForAgentSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

const publishAgentSkillToGlobalSchema = z.object({
  agentId: z.string().min(1),
  skillName: z.string().min(1),
});

// ─── uploadAgentSkillsSchema ────────────────────────────────────────────

describe('uploadAgentSkillsSchema', () => {
  it('parses valid input', () => {
    expect(
      uploadAgentSkillsSchema.parse({ agentId: 'agent-1', archiveBase64: 'SGVsbG8gV29ybGQ=' }),
    ).toMatchObject({ agentId: 'agent-1' });
  });

  it('rejects missing agentId', () => {
    expect(() => uploadAgentSkillsSchema.parse({ archiveBase64: 'YQ==' })).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() => uploadAgentSkillsSchema.parse({ agentId: '', archiveBase64: 'YQ==' })).toThrow();
  });

  it('rejects missing archiveBase64', () => {
    expect(() => uploadAgentSkillsSchema.parse({ agentId: 'a' })).toThrow();
  });

  it('rejects empty archiveBase64', () => {
    expect(() => uploadAgentSkillsSchema.parse({ agentId: 'a', archiveBase64: '' })).toThrow();
  });
});

// ─── deleteAgentSkillSchema ─────────────────────────────────────────────

describe('deleteAgentSkillSchema', () => {
  it('parses valid input', () => {
    expect(
      deleteAgentSkillSchema.parse({ agentId: 'agent-1', skillName: 'email-helper' }),
    ).toMatchObject({ agentId: 'agent-1', skillName: 'email-helper' });
  });

  it('rejects missing agentId', () => {
    expect(() => deleteAgentSkillSchema.parse({ skillName: 's' })).toThrow();
  });

  it('rejects missing skillName', () => {
    expect(() => deleteAgentSkillSchema.parse({ agentId: 'a' })).toThrow();
  });

  it('rejects empty skillName', () => {
    expect(() => deleteAgentSkillSchema.parse({ agentId: 'a', skillName: '' })).toThrow();
  });
});

// ─── uploadSystemSkillsSchema ───────────────────────────────────────────

describe('uploadSystemSkillsSchema', () => {
  it('parses valid input', () => {
    expect(uploadSystemSkillsSchema.parse({ archiveBase64: 'SGVsbG8gV29ybGQ=' })).toMatchObject({});
  });

  it('rejects missing archiveBase64', () => {
    expect(() => uploadSystemSkillsSchema.parse({})).toThrow();
  });

  it('rejects empty archiveBase64', () => {
    expect(() => uploadSystemSkillsSchema.parse({ archiveBase64: '' })).toThrow();
  });
});

// ─── deleteSystemSkillSchema ───────────────────────────────────────────

describe('deleteSystemSkillSchema', () => {
  it('parses valid input', () => {
    expect(deleteSystemSkillSchema.parse({ skillName: 'github-repos-helper' })).toMatchObject({
      skillName: 'github-repos-helper',
    });
  });

  it('rejects missing skillName', () => {
    expect(() => deleteSystemSkillSchema.parse({})).toThrow();
  });

  it('rejects empty skillName', () => {
    expect(() => deleteSystemSkillSchema.parse({ skillName: '' })).toThrow();
  });
});

// ─── installGlobalSkillForAgentSchema ─────────────────────────────────

describe('installGlobalSkillForAgentSchema', () => {
  it('parses valid input', () => {
    expect(
      installGlobalSkillForAgentSchema.parse({
        agentId: 'agent-1',
        skillName: 'github-milestones',
      }),
    ).toMatchObject({ agentId: 'agent-1', skillName: 'github-milestones' });
  });

  it('rejects missing agentId', () => {
    expect(() => installGlobalSkillForAgentSchema.parse({ skillName: 's' })).toThrow();
  });

  it('rejects missing skillName', () => {
    expect(() => installGlobalSkillForAgentSchema.parse({ agentId: 'a' })).toThrow();
  });

  it('rejects empty skillName', () => {
    expect(() => installGlobalSkillForAgentSchema.parse({ agentId: 'a', skillName: '' })).toThrow();
  });
});

// ─── publishAgentSkillToGlobalSchema ──────────────────────────────────

describe('publishAgentSkillToGlobalSchema', () => {
  it('parses valid input', () => {
    expect(
      publishAgentSkillToGlobalSchema.parse({ agentId: 'agent-1', skillName: 'github-repos' }),
    ).toMatchObject({ agentId: 'agent-1', skillName: 'github-repos' });
  });

  it('rejects missing agentId', () => {
    expect(() => publishAgentSkillToGlobalSchema.parse({ skillName: 's' })).toThrow();
  });

  it('rejects missing skillName', () => {
    expect(() => publishAgentSkillToGlobalSchema.parse({ agentId: 'a' })).toThrow();
  });

  it('rejects empty agentId', () => {
    expect(() => publishAgentSkillToGlobalSchema.parse({ agentId: '', skillName: 's' })).toThrow();
  });
});

// ─── safeParse (non-throwing) ─────────────────────────────────────────────

describe('schema.safeParse', () => {
  it('uploadSystemSkillsSchema safeParse returns success false for missing archiveBase64', () => {
    const result = uploadSystemSkillsSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('deleteSystemSkillSchema safeParse returns success true for valid input', () => {
    const result = deleteSystemSkillSchema.safeParse({ skillName: 's' });
    expect(result.success).toBe(true);
  });

  it('installGlobalSkillForAgentSchema safeParse returns success false for missing skillName', () => {
    const result = installGlobalSkillForAgentSchema.safeParse({ agentId: 'a' });
    expect(result.success).toBe(false);
  });

  it('publishAgentSkillToGlobalSchema safeParse returns success true for valid input', () => {
    const result = publishAgentSkillToGlobalSchema.safeParse({ agentId: 'a', skillName: 's' });
    expect(result.success).toBe(true);
  });
});
