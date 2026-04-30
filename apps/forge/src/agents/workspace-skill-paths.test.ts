import { describe, expect, it } from 'vitest';
import { resolveAgentWorkspaceRoot, resolveAgentSkillsRoot, resolveAgentSkillRoot } from './workspace-skill-paths';
import type { WorkspaceFilesystemConfig } from '../database/schema';

describe('resolveAgentWorkspaceRoot', () => {
  const base = '/workspace';

  it('uses "workspace" when workspaceFilesystem is null', () => {
    const result = resolveAgentWorkspaceRoot(base, null, 'agent-1');
    expect(result).toBe('/workspace/agent-1/workspace');
  });

  it('uses "workspace" when workspaceFilesystem is undefined', () => {
    const result = resolveAgentWorkspaceRoot(base, undefined, 'agent-1');
    expect(result).toBe('/workspace/agent-1/workspace');
  });

  it('uses "workspace" when workspaceFilesystem has no basePath', () => {
    const result = resolveAgentWorkspaceRoot(base, {}, 'agent-1');
    expect(result).toBe('/workspace/agent-1/workspace');
  });

  it('treats basePath as absolute path, not relative', () => {
    const config: WorkspaceFilesystemConfig = { basePath: '/custom' };
    const result = resolveAgentWorkspaceRoot(base, config, 'agent-1');
    expect(result).toBe('/custom');
  });

  it('handles basePath as absolute path', () => {
    const config: WorkspaceFilesystemConfig = { basePath: '/absolute/path' };
    const result = resolveAgentWorkspaceRoot(base, config, 'agent-1');
    expect(result).toBe('/absolute/path');
  });

  it('handles relative basePath (joined with agent dir)', () => {
    const config: WorkspaceFilesystemConfig = { basePath: 'data' };
    const result = resolveAgentWorkspaceRoot(base, config, 'agent-1');
    expect(result).toBe('/workspace/agent-1/data');
  });
});

describe('resolveAgentSkillsRoot', () => {
  const base = '/workspace';

  it('appends /skills to workspace root when no custom basePath', () => {
    const result = resolveAgentSkillsRoot(base, null, 'agent-1');
    expect(result).toBe('/workspace/agent-1/workspace/skills');
  });

  it('appends /skills to absolute basePath', () => {
    const config: WorkspaceFilesystemConfig = { basePath: '/custom' };
    const result = resolveAgentSkillsRoot(base, config, 'agent-1');
    expect(result).toBe('/custom/skills');
  });
});

describe('resolveAgentSkillRoot', () => {
  const base = '/workspace';

  it('returns skillsRoot and skillRoot correctly for default config', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: base,
      agent: { id: 'agent-5', workspaceFilesystem: null },
      skillName: 'coding',
    });
    expect(result.skillsRoot).toBe('/workspace/agent-5/workspace/skills');
    expect(result.skillRoot).toBe('/workspace/agent-5/workspace/skills/coding');
  });

  it('returns correct paths with absolute basePath', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: base,
      agent: {
        id: 'agent-5',
        workspaceFilesystem: { basePath: '/my-workspace' },
      },
      skillName: 'testing',
    });
    expect(result.skillsRoot).toBe('/my-workspace/skills');
    expect(result.skillRoot).toBe('/my-workspace/skills/testing');
  });

  it('handles skillName with special characters', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: base,
      agent: { id: 'agent-5', workspaceFilesystem: null },
      skillName: 'my-skill-v2.0',
    });
    expect(result.skillRoot).toBe('/workspace/agent-5/workspace/skills/my-skill-v2.0');
  });

  it('handles skillName with slashes (nested paths)', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: base,
      agent: { id: 'agent-5', workspaceFilesystem: null },
      skillName: 'nested/skill',
    });
    expect(result.skillRoot).toBe('/workspace/agent-5/workspace/skills/nested/skill');
  });

  it('handles empty skillName', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: base,
      agent: { id: 'agent-5', workspaceFilesystem: null },
      skillName: '',
    });
    expect(result.skillsRoot).toBe('/workspace/agent-5/workspace/skills');
    expect(result.skillRoot).toBe('/workspace/agent-5/workspace/skills');
  });
});
