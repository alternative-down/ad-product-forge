import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';

// --- Mock factories (vi.mock is hoisted, so these run before the SUT import) ---

const mockForgeDebug = vi.fn();
const mockCreateTool = vi.fn((def) => def);

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
  createTool: mockCreateTool,
}));

vi.mock('./workspace-skill-paths', () => ({
  resolveAgentSkillRoot: vi.fn(({ skillName }) => ({
    skillsRoot: '/base/agent-42/skills',
    skillRoot: '/base/agent-42/skills/' + skillName,
  })),
}));

const mockPublishGlobalCatalog = vi.fn().mockResolvedValue(undefined);
vi.mock('./global-skills', () => ({
  publishAgentWorkspaceSkillToGlobalCatalog: mockPublishGlobalCatalog,
}));

const mockHasToolPermission = vi.fn();
vi.mock('../capabilities/catalog', () => ({
  hasToolPermission: mockHasToolPermission,
}));

const mockFs = {
  readdir: vi.fn(),
  readFile: vi.fn(),
};

vi.mock('node:fs/promises', () => ({ default: mockFs }));

// --- Shared test setup ---

const mockDb = {
  query: {
    agents: {
      findFirst: vi.fn(),
    },
  },
} as unknown as LibSQLDatabase<any>;

const { createAgentSkillTools } = await import('./skills-tools');

describe('createAgentSkillTools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasToolPermission.mockReturnValue(false);
    mockCreateTool.mockImplementation((def) => def);
    mockPublishGlobalCatalog.mockClear();
  });

  // -------------------------------------------------------------------------
  // Tool presence
  // -------------------------------------------------------------------------

  it('always returns load_workspace_skill', () => {
    const tools = createAgentSkillTools({ db: mockDb, workspaceBasePath: '/base', agentId: 'agent-42', allowedToolIds: null });
    expect(tools).toHaveProperty('load_workspace_skill');
  });

  it('omits publish_skill_to_catalog when not permitted', () => {
    const tools = createAgentSkillTools({ db: mockDb, workspaceBasePath: '/base', agentId: 'agent-42', allowedToolIds: new Set() });
    expect(tools).not.toHaveProperty('publish_skill_to_catalog');
  });

  it('includes publish_skill_to_catalog when permitted', () => {
    mockHasToolPermission.mockReturnValue(true);
    const tools = createAgentSkillTools({ db: mockDb, workspaceBasePath: '/base', agentId: 'agent-42', allowedToolIds: new Set(['publish_skill_to_catalog']) });
    expect(tools).toHaveProperty('publish_skill_to_catalog');
  });

  // -------------------------------------------------------------------------
  // load_workspace_skill.execute
  // -------------------------------------------------------------------------

  describe('load_workspace_skill.execute', () => {
    it('throws when agent not found', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue(null);
      const tools = createAgentSkillTools({ db: mockDb, workspaceBasePath: '/base', agentId: 'agent-42', allowedToolIds: null });
      await expect(tools.load_workspace_skill.execute({ skillName: 'my-skill' }, {} as any)).rejects.toThrow('Agent not found: agent-42');
    });

    it('loads skill markdown and support files', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({ id: 'agent-42', workspaceFilesystem: null });
      mockFs.readdir.mockResolvedValue([
        { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
        { name: 'config.json', isDirectory: () => false, isFile: () => true },
      ]);
      mockFs.readFile
        .mockResolvedValueOnce('# My Skill description')
        .mockResolvedValueOnce('{"key":"value"}');
      const tools = createAgentSkillTools({ db: mockDb, workspaceBasePath: '/base', agentId: 'agent-42', allowedToolIds: null });
      const result = await tools.load_workspace_skill.execute({ skillName: 'my-skill' }, {} as any) as any;
      expect(result.skillName).toBe('my-skill');
      expect(result.skillMarkdown).toBe('# My Skill description');
      expect(result.supportFiles).toHaveLength(1);
      expect(result.supportFiles[0].path).toBe('skills/my-skill/config.json');
      expect(result.supportFiles[0].content).toBe('{"key":"value"}');
    });

    it('returns empty supportFiles when only SKILL.md exists', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({ id: 'agent-42', workspaceFilesystem: null });
      mockFs.readdir.mockResolvedValue([
        { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
      ]);
      mockFs.readFile.mockResolvedValue('# Skill');
      const tools = createAgentSkillTools({ db: mockDb, workspaceBasePath: '/base', agentId: 'agent-42', allowedToolIds: null });
      const result = await tools.load_workspace_skill.execute({ skillName: 'my-skill' }, {} as any) as any;
      expect(result.supportFiles).toHaveLength(0);
    });

    it('recurses into subdirectories', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({ id: 'agent-42', workspaceFilesystem: null });
      // First readdir: root level (SKILL.md + subdir)
      mockFs.readdir
        .mockResolvedValueOnce([
          { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
          { name: 'subdir', isDirectory: () => true, isFile: () => false },
        ])
        // Second readdir: subdir contents
        .mockResolvedValueOnce([
          { name: 'nested.json', isDirectory: () => false, isFile: () => true },
        ]);
      mockFs.readFile
        .mockResolvedValueOnce('# Skill')
        .mockResolvedValueOnce('{"nested":true}');
      const tools = createAgentSkillTools({ db: mockDb, workspaceBasePath: '/base', agentId: 'agent-42', allowedToolIds: null });
      const result = await tools.load_workspace_skill.execute({ skillName: 'my-skill' }, {} as any) as any;
      expect(result.supportFiles).toHaveLength(1);
      expect(result.supportFiles[0].path).toBe('skills/my-skill/subdir/nested.json');
    });

    it('logs warning and returns null for unreadable support files', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({ id: 'agent-42', workspaceFilesystem: null });
      mockFs.readdir.mockResolvedValue([
        { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
        { name: 'broken.txt', isDirectory: () => false, isFile: () => true },
      ]);
      mockFs.readFile
        .mockResolvedValueOnce('# Skill')
        .mockRejectedValueOnce(new Error('ENOENT'));
      const tools = createAgentSkillTools({ db: mockDb, workspaceBasePath: '/base', agentId: 'agent-42', allowedToolIds: null });
      const result = await tools.load_workspace_skill.execute({ skillName: 'my-skill' }, {} as any) as any;
      expect(result.supportFiles[0].content).toBeNull();
      expect(mockForgeDebug).toHaveBeenCalledWith(expect.objectContaining({
        level: 'warn',
        scope: 'skills-tools',
        message: 'Failed to read file',
      }));
    });

    it('returns correct skill path fields', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({ id: 'agent-42', workspaceFilesystem: null });
      mockFs.readdir.mockResolvedValue([
        { name: 'SKILL.md', isDirectory: () => false, isFile: () => true },
      ]);
      mockFs.readFile.mockResolvedValue('# Skill');
      const tools = createAgentSkillTools({ db: mockDb, workspaceBasePath: '/base', agentId: 'agent-42', allowedToolIds: null });
      const result = await tools.load_workspace_skill.execute({ skillName: 'my-tool' }, {} as any) as any;
      expect(result.skillPath).toBe('skills/my-tool');
      expect(result.skillMarkdownPath).toBe('skills/my-tool/SKILL.md');
    });
  });

  // -------------------------------------------------------------------------
  // publish_skill_to_catalog.execute
  // -------------------------------------------------------------------------

  describe('publish_skill_to_catalog.execute', () => {
    beforeEach(() => {
      mockHasToolPermission.mockReturnValue(true);
    });

    it('calls publishAgentWorkspaceSkillToGlobalCatalog and returns success', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue({ id: 'agent-42', workspaceFilesystem: null });
      const tools = createAgentSkillTools({ db: mockDb, workspaceBasePath: '/base', agentId: 'agent-42', allowedToolIds: new Set(['publish_skill_to_catalog']) });
      const result = await tools.publish_skill_to_catalog.execute({ skillName: 'my-skill' }, {} as any) as any;
      expect(result).toEqual({ success: true, skillName: 'my-skill' });
      expect(mockPublishGlobalCatalog).toHaveBeenCalledOnce();
      expect(mockPublishGlobalCatalog).toHaveBeenCalledWith({
        workspaceBasePath: '/base',
        agent: { id: 'agent-42', workspaceFilesystem: null },
        skillName: 'my-skill',
      });
    });

    it('throws when agent not found', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue(null);
      const tools = createAgentSkillTools({ db: mockDb, workspaceBasePath: '/base', agentId: 'agent-42', allowedToolIds: new Set(['publish_skill_to_catalog']) });
      await expect(tools.publish_skill_to_catalog.execute({ skillName: 'my-skill' }, {} as any)).rejects.toThrow('Agent not found: agent-42');
    });
  });
});
