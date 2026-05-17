/**
 * Unit tests for agents/workspace-skill-paths.ts.
 * Pure path resolution utilities for agent workspace and skills.
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { vi } from 'vitest';

// Mock path module so we can test the resolution logic without OS-dependent results
vi.mock('node:path', async () => {
  const actual = await vi.importActual('node:path');
  return {
    ...actual as object,
    resolve: vi.fn((...segments: string[]) => {
      // Simple mock: join all segments with '/'
      return '/' + segments.filter(Boolean).join('/');
    }),
  };
});

import {
  resolveAgentWorkspaceRoot,
  resolveAgentSkillsRoot,
  resolveAgentSkillRoot,
} from './workspace-skill-paths';

const { resolve } = await import('node:path');

describe('resolveAgentWorkspaceRoot', () => {
  it('uses /workspace when no workspaceFilesystem is provided', () => {
    const result = resolveAgentWorkspaceRoot('/base', undefined, 'agent-42');
    expect(result).toMatch(/\/agent-42\/workspace$/);
  });

  it('uses /workspace when workspaceFilesystem is null', () => {
    const result = resolveAgentWorkspaceRoot('/base', null, 'agent-42');
    expect(result).toMatch(/\/agent-42\/workspace$/);
  });

  it('appends basePath to agent workspace when provided', () => {
    const result = resolveAgentWorkspaceRoot(
      '/base',
      { basePath: 'custom' },
      'agent-42',
    );
    expect(result).toMatch(/\/agent-42\/custom$/);
  });

  it('appends nested basePath correctly', () => {
    const result = resolveAgentWorkspaceRoot(
      '/base',
      { basePath: 'data/workspace' },
      'agent-42',
    );
    expect(result).toMatch(/\/agent-42\/data\/workspace$/);
  });

  it('agentId is included in the path', () => {
    const result = resolveAgentWorkspaceRoot('/base', undefined, 'my-agent-id');
    expect(result).toContain('my-agent-id');
  });

  it('workspaceBasePath is the first segment', () => {
    const result = resolveAgentWorkspaceRoot('/workspace', undefined, 'agent-1');
    expect(result).toMatch(/^\/workspace/);
  });
});

describe('resolveAgentSkillsRoot', () => {
  it('appends /skills to workspace root', () => {
    const result = resolveAgentSkillsRoot('/base', undefined, 'agent-42');
    expect(result).toMatch(/\/skills$/);
  });

  it('is workspace root + skills suffix', () => {
    const wsRoot = resolveAgentWorkspaceRoot('/base', undefined, 'agent-42');
    const skillsRoot = resolveAgentSkillsRoot('/base', undefined, 'agent-42');
    expect(skillsRoot).toBe(wsRoot + '/skills');
  });

  it('works with custom workspaceFilesystem', () => {
    const result = resolveAgentSkillsRoot('/base', { basePath: 'custom' }, 'agent-42');
    expect(result).toMatch(/\/skills$/);
    expect(result).toContain('agent-42');
  });
});

describe('resolveAgentSkillRoot', () => {
  it('returns skillsRoot and skillRoot with /skillName appended', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: '/base',
      agent: { id: 'agent-42', workspaceFilesystem: null },
      skillName: 'my-skill',
    });
    expect(result.skillsRoot).toMatch(/\/skills$/);
    expect(result.skillRoot).toMatch(/\/my-skill$/);
  });

  it('skillRoot ends with the skill name', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: '/base',
      agent: { id: 'agent-x', workspaceFilesystem: null },
      skillName: 'test-tool',
    });
    expect(result.skillRoot).toMatch(/test-tool$/);
  });

  it('skillRoot is skillsRoot + skillName', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: '/base',
      agent: { id: 'agent-1', workspaceFilesystem: null },
      skillName: 'deploy',
    });
    expect(result.skillRoot).toBe(result.skillsRoot + '/deploy');
  });

  it('works with nested basePath workspaceFilesystem', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: '/base',
      agent: { id: 'agent-42', workspaceFilesystem: '/data/ws' },
      skillName: 'skill',
    });
    expect(result.skillsRoot).toMatch(/\/skills$/);
    expect(result.skillRoot).toMatch(/\/skill$/);
  });

  it('skillName with spaces/special chars produces valid path', () => {
    const result = resolveAgentSkillRoot({
      workspaceBasePath: '/base',
      agent: { id: 'agent-42', workspaceFilesystem: null },
      skillName: 'my cool skill',
    });
    expect(result.skillRoot).toContain('my cool skill');
  });
});
