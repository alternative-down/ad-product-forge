import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mock state ──────────────────────────────────────────────────────────────────
const mockState = {
  readdir: [] as Array<{ name: string; isFile: () => boolean; isDirectory: () => boolean }[]>,
  readFile: [] as string[],
  readFileErrors: [] as Error[],
};

const fsMocks = vi.hoisted(() => ({
  readdir: vi.fn(() => {
    if (mockState.readdir.length === 0) return Promise.resolve([]);
    return Promise.resolve(mockState.readdir.shift()!);
  }),
  readFile: vi.fn((path: string) => {
    if (mockState.readFileErrors.length > 0) {
      const err = mockState.readFileErrors.shift()!;
      return Promise.reject(err) as never;
    }
    if (mockState.readFile.length === 0) return Promise.resolve('');
    return Promise.resolve(mockState.readFile.shift()!);
  }),
}));

vi.mock('node:fs/promises', () => ({
  default: { readdir: fsMocks.readdir, readFile: fsMocks.readFile },
  readdir: fsMocks.readdir,
  readFile: fsMocks.readFile,
}));

vi.mock('@forge-runtime/core', () => ({
  createTool: vi.fn((def: {
    id: string;
    description: string;
    inputSchema: object;
    execute: (input: unknown) => Promise<unknown>;
  }) => ({ id: def.id, description: def.description, execute: def.execute })),
  forgeDebug: vi.fn(),
}));

const mockHasToolPermission = vi.fn();
vi.mock('../capabilities/catalog', () => ({
  hasToolPermission: mockHasToolPermission,
}));

const mockPublish = vi.fn();
vi.mock('./global-skills', () => ({
  publishAgentWorkspaceSkillToGlobalCatalog: mockPublish,
}));

const mockResolveAgentSkillRoot = vi.fn();
vi.mock('./workspace-skill-paths', () => ({
  resolveAgentSkillRoot: mockResolveAgentSkillRoot,
}));

// ─── Helpers ───────────────────────────────────────────────────────────────────
function entry(name: string, isDir = false) {
  return {
    name,
    isFile: () => !isDir,
    isDirectory: () => isDir,
  };
}

// ─── Tests ─────────────────────────────────────────────────────────────────────
describe('createAgentSkillTools', () => {
  const mockDb = {
    query: {
      agents: {
        findFirst: vi.fn(),
      },
    },
  } as any;

  const baseInput = {
    db: mockDb,
    workspaceBasePath: '/base',
    agentId: 'agent-42',
  };

  beforeEach(() => {
    mockState.readdir = [];
    mockState.readFile = [];
    mockState.readFileErrors = [];
    mockHasToolPermission.mockReset();
    mockHasToolPermission.mockReturnValue(false);
    mockResolveAgentSkillRoot.mockReset();
    mockPublish.mockReset();
    mockDb.query.agents.findFirst.mockReset();
    fsMocks.readdir.mockClear();
    fsMocks.readFile.mockClear();
  });

  // ── load_workspace_skill ──────────────────────────────────────────────────────

  describe('load_workspace_skill', () => {
    it('throws when agent is not found', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue(null);
      const { createAgentSkillTools } = await import('./skills-tools');
      const tools = createAgentSkillTools(baseInput);
      await expect(tools.load_workspace_skill!.execute({ skillName: 'test-skill' }))
        .rejects.toThrow('Agent not found: agent-42');
    });

    it('throws on path traversal attempt via skillName', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({
        id: 'agent-42',
        workspaceFilesystem: null,
      });
      mockResolveAgentSkillRoot.mockReturnValue({
        skillsRoot: '/base/agent-42/workspace/skills',
        skillRoot: '/base/agent-42/workspace/skills/../etc',
      });
      const { createAgentSkillTools } = await import('./skills-tools');
      const tools = createAgentSkillTools(baseInput);
      await expect(tools.load_workspace_skill!.execute({ skillName: '../etc' }))
        .rejects.toThrow('Invalid skill name');
    });

    it('returns skill data with markdown and support files', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({
        id: 'agent-42',
        workspaceFilesystem: null,
      });
      mockResolveAgentSkillRoot.mockReturnValue({
        skillsRoot: '/base/agent-42/workspace/skills',
        skillRoot: '/base/agent-42/workspace/skills/my-tool',
      });
      // Top-level: SKILL.md + subdir/
      mockState.readdir.push([entry('SKILL.md'), entry('subdir', true)]);
      // Subdir contents
      mockState.readdir.push([entry('helper.ts')]);
      mockState.readFile.push('# My Tool\n\nA useful skill.');
      mockState.readFile.push('export const help = true;');

      const { createAgentSkillTools } = await import('./skills-tools');
      const tools = createAgentSkillTools(baseInput);
      const result = await tools.load_workspace_skill!.execute({ skillName: 'my-tool' });

      expect(result.skillName).toBe('my-tool');
      expect(result.skillMarkdown).toBe('# My Tool\n\nA useful skill.');
      expect(result.skillMarkdownPath).toBe('skills/my-tool/SKILL.md');
      expect(result.supportFiles).toContainEqual(
        expect.objectContaining({ path: 'skills/my-tool/subdir/helper.ts' }),
      );
    });

    it('skips SKILL.md in supportFiles', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({
        id: 'agent-42',
        workspaceFilesystem: null,
      });
      mockResolveAgentSkillRoot.mockReturnValue({
        skillsRoot: '/base/agent-42/workspace/skills',
        skillRoot: '/base/agent-42/workspace/skills/my-tool',
      });
      mockState.readdir.push([entry('SKILL.md')]);
      mockState.readFile.push('# Skill');

      const { createAgentSkillTools } = await import('./skills-tools');
      const tools = createAgentSkillTools(baseInput);
      const result = await tools.load_workspace_skill!.execute({ skillName: 'my-tool' });

      expect(result.supportFiles).toHaveLength(0);
    });
  });

  // ── publish_skill_to_catalog ─────────────────────────────────────────────────

  describe('publish_skill_to_catalog', () => {
    it('omits tool when permission is false', async () => {
      mockHasToolPermission.mockReturnValue(false);
      const { createAgentSkillTools } = await import('./skills-tools');
      const tools = createAgentSkillTools({ ...baseInput, allowedToolIds: new Set() });
      expect(tools.publish_skill_to_catalog).toBeUndefined();
    });

    it('includes tool when permission is granted', async () => {
      mockHasToolPermission.mockReturnValue(true);
      const { createAgentSkillTools } = await import('./skills-tools');
      const tools = createAgentSkillTools({ ...baseInput, allowedToolIds: new Set(['publish_skill_to_catalog']) });
      expect(tools.publish_skill_to_catalog).toBeDefined();
    });

    it('calls publishAgentWorkspaceSkillToGlobalCatalog with correct args', async () => {
      mockHasToolPermission.mockReturnValue(true);
      mockPublish.mockResolvedValue(undefined);
      const agent = { id: 'agent-42', workspaceFilesystem: null };
      mockDb.query.agents.findFirst.mockResolvedValue(agent);

      const { createAgentSkillTools } = await import('./skills-tools');
      const tools = createAgentSkillTools({
        ...baseInput,
        allowedToolIds: new Set(['publish_skill_to_catalog']),
      });
      const result = await tools.publish_skill_to_catalog!.execute({ skillName: 'my-tool' });

      expect(mockPublish).toHaveBeenCalledWith({
        workspaceBasePath: '/base',
        agent,
        skillName: 'my-tool',
      });
      expect(result).toEqual({ success: true, skillName: 'my-tool' });
    });
  });
});
