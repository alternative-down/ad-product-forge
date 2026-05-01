import { describe, expect, it } from 'vitest';
import {
  resolveAgentWorkspaceRoot,
  resolveAgentSkillsRoot,
  resolveAgentSkillRoot,
} from './workspace-skill-paths';

describe('resolveAgentWorkspaceRoot', () => {
  it('resolves workspace root with default workspace subfolder', () => {
    const result = resolveAgentWorkspaceRoot('/base', null, 'agent-123');
    expect(result).toBe('/base/agent-123/workspace');
  });

  it('resolves workspace root with custom basePath', () => {
    const result = resolveAgentWorkspaceRoot('/base', { basePath: 'custom' }, 'agent-123');
    expect(result).toBe('/base/agent-123/custom');
  });

  it('resolves workspace root with custom basePath containing slashes', () => {
    const result = resolveAgentWorkspaceRoot('/base', { basePath: 'workspace/sub' }, 'agent-abc');
    expect(result).toBe('/base/agent-abc/workspace/sub');
  });

  it('handles undefined workspaceFilesystem same as null', () => {
    const result = resolveAgentWorkspaceRoot('/base', undefined, 'agent-123');
    expect(result).toBe('/base/agent-123/workspace');
  });
});

describe('resolveAgentSkillsRoot', () => {
  it('resolves skills root as workspace/skill', () => {
    const result = resolveAgentSkillsRoot('/base', null, 'agent-123');
    expect(result).toBe('/base/agent-123/workspace/skills');
  });

  it('resolves skills root with custom basePath', () => {
    const result = resolveAgentSkillsRoot('/base', { basePath: 'custom' }, 'agent-123');
    expect(result).toBe('/base/agent-123/custom/skills');
  });
});

describe('resolveAgentSkillRoot', () => {
  it('resolves skill root for a given skill', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: '/base',
      agent: { id: 'agent-123', workspaceFilesystem: null },
      skillName: 'my-skill',
    });

    expect(result.skillsRoot).toBe('/base/agent-123/workspace/skills');
    expect(result.skillRoot).toBe('/base/agent-123/workspace/skills/my-skill');
  });

  it('resolves skill root with custom workspaceFilesystem', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: '/base',
      agent: { id: 'agent-123', workspaceFilesystem: { basePath: 'custom' } },
      skillName: 'another-skill',
    });

    expect(result.skillsRoot).toBe('/base/agent-123/custom/skills');
    expect(result.skillRoot).toBe('/base/agent-123/custom/skills/another-skill');
  });

  it('returns skillsRoot and skillRoot', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: '/base',
      agent: { id: 'agent-xyz', workspaceFilesystem: null },
      skillName: 'test-skill',
    });

    expect(result).toHaveProperty('skillsRoot');
    expect(result).toHaveProperty('skillRoot');
    expect(result.skillRoot).toBe(path.join(result.skillsRoot, 'test-skill'));
  });
});

import path from 'node:path';