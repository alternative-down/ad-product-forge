import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import {
  resolveAgentWorkspaceRoot,
  resolveAgentSkillsRoot,
  resolveAgentSkillRoot,
} from './workspace-skill-paths';

vi.mock('node:path', async (importOriginal) => {
  const actual = await importOriginal<typeof path>();
  return {
    ...actual,
    resolve: (...args: string[]) => actual.resolve(...args),
  };
});

describe('resolveAgentWorkspaceRoot', () => {
  it('uses default workspace subdir when no filesystem config', () => {
    const result = resolveAgentWorkspaceRoot('/base', null, 'agent-abc');
    expect(result).toBe(path.resolve('/base/agent-abc/workspace'));
  });

  it('uses default workspace subdir when filesystem config is undefined', () => {
    const result = resolveAgentWorkspaceRoot('/base', undefined, 'agent-abc');
    expect(result).toBe(path.resolve('/base/agent-abc/workspace'));
  });

  it('uses basePath from workspaceFilesystem when provided', () => {
    const result = resolveAgentWorkspaceRoot('/base', { basePath: 'my-workspace' }, 'agent-abc');
    expect(result).toBe(path.resolve('/base/agent-abc/my-workspace'));
  });
});

describe('resolveAgentSkillsRoot', () => {
  it('uses skills subdir of workspace root when no filesystem config', () => {
    const result = resolveAgentSkillsRoot('/base', null, 'agent-abc');
    expect(result).toBe(path.resolve('/base/agent-abc/workspace/skills'));
  });

  it('uses basePath from workspaceFilesystem when provided', () => {
    const result = resolveAgentSkillsRoot('/base', { basePath: 'data/agents' }, 'agent-abc');
    expect(result).toBe(path.resolve('/base/agent-abc/data/agents/skills'));
  });
});

describe('resolveAgentSkillRoot', () => {
  it('returns skillsRoot and skillRoot with skill name appended', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: '/base',
      agent: { id: 'agent-xyz', workspaceFilesystem: null },
      skillName: 'code-review',
    });

    expect(result.skillsRoot).toBe(path.resolve('/base/agent-xyz/workspace/skills'));
    expect(result.skillRoot).toBe(path.resolve('/base/agent-xyz/workspace/skills/code-review'));
  });

  it('uses agent workspaceFilesystem.basePath for skillsRoot', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: '/base',
      agent: { id: 'agent-xyz', workspaceFilesystem: { basePath: 'data' } },
      skillName: 'test-skill',
    });

    expect(result.skillsRoot).toBe(path.resolve('/base/agent-xyz/data/skills'));
    expect(result.skillRoot).toBe(path.resolve('/base/agent-xyz/data/skills/test-skill'));
  });
});
