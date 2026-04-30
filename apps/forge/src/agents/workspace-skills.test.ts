import { describe, expect, it, vi, beforeEach } from 'vitest';
import { zipSync } from 'fflate';
import fs from 'node:fs/promises';
import { installAgentWorkspaceSkillsArchive } from './workspace-skill-archive';
import {
  listAgentWorkspaceSkills,
  installAgentWorkspaceSkillsFromZip,
  deleteAgentWorkspaceSkill,
} from './workspace-skills';

// Track mock values in arrays that each test can push into.
// Using concrete types so they work in vi.hoisted() (which runs at runtime, not compile time).
type ReaddirEntry = Awaited<ReturnType<typeof fs.readdir>>[number];
type StatResult = Awaited<ReturnType<typeof fs.stat>>;
const mockReplies: {
  readdir: ReaddirEntry[][];
  readFile: string[];
  stat: StatResult[];
  rm: unknown[];
} = {
  readdir: [],
  readFile: [],
  stat: [],
  rm: [],
};

const fsMocks = vi.hoisted(() => ({
  readdir: vi.fn<(...args: unknown[]) => Promise<ReaddirEntry[]>>(() => {
    if (mockReplies.readdir.length === 0) return Promise.resolve([]) as never;
    return Promise.resolve(mockReplies.readdir.shift()!) as never;
  }),
  readFile: vi.fn<() => Promise<string>>((..._args) => {     if (mockReplies.readFile.length === 0) return Promise.resolve('') as never;
    return Promise.resolve(mockReplies.readFile.shift()!) as never;
  }),
  stat: vi.fn<() => Promise<StatResult>>(() => {
    if (mockReplies.stat.length === 0) return Promise.resolve({ mtimeMs: 0 } as StatResult) as never;
    return Promise.resolve(mockReplies.stat.shift()!) as never;
  }),
  mkdir: vi.fn<() => Promise<void>>(),
  rm: vi.fn<() => Promise<void>>(() => {
    if (mockReplies.rm.length === 0) return Promise.reject(new Error('rm not mocked')) as never;
    return Promise.reject(mockReplies.rm.shift()) as never;
  }),
  writeFile: vi.fn<() => Promise<void>>(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    readdir: fsMocks.readdir,
    readFile: fsMocks.readFile,
    stat: fsMocks.stat,
    mkdir: fsMocks.mkdir,
    rm: fsMocks.rm,
    writeFile: fsMocks.writeFile,
  },
  readdir: fsMocks.readdir,
  readFile: fsMocks.readFile,
  stat: fsMocks.stat,
  mkdir: fsMocks.mkdir,
  rm: fsMocks.rm,
  writeFile: fsMocks.writeFile,
}));

vi.mock('./workspace-skill-archive', () => ({
  installAgentWorkspaceSkillsArchive: vi.fn(),
}));

vi.mock('./workspace-skill-paths', () => ({
  resolveAgentSkillsRoot: vi.fn(() => '/mock/agent-1/workspace/skills'),
  resolveAgentSkillRoot: vi.fn(() => ({
    skillsRoot: '/mock/agent-1/workspace/skills',
    skillRoot: '/mock/agent-1/workspace/skills/my-skill',
  })),
}));

function pushMocks(calls: {
  readdir?: ReaddirEntry[][];
  readFile?: string[];
  stat?: StatResult[];
  rm?: unknown[];
}) {
  if (calls.readdir) mockReplies.readdir.push(...calls.readdir);
  if (calls.readFile) mockReplies.readFile.push(...calls.readFile);
  if (calls.stat) mockReplies.stat.push(...calls.stat);
  if (calls.rm) mockReplies.rm.push(...calls.rm);
}

describe('listAgentWorkspaceSkills', () => {
  beforeEach(() => {
    // Reset the shared mock-reply queues so each test has fresh state
    mockReplies.readdir.length = 0;
    mockReplies.readFile.length = 0;
    mockReplies.stat.length = 0;
    mockReplies.rm.length = 0;
    vi.clearAllMocks();
  });

  it('returns empty array when skills directory does not exist', async () => {
    pushMocks({ readdir: [Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' })) as ReaddirEntry[]] });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });

    expect(result).toEqual([]);
  });

  it('returns empty array when skills directory is empty', async () => {
    pushMocks({ readdir: [[]] });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });

    expect(result).toEqual([]);
  });

  it('skips directories without SKILL.md', async () => {
    pushMocks({
      readdir: [
        [{ isDirectory: () => true, isFile: () => false, name: 'incomplete-skill' } as ReaddirEntry],
        [],
      ],
      readFile: [Promise.reject(new Error('ENOENT'))],
    });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });

    expect(result).toEqual([]);
  });

  it('returns skill summaries sorted by name', async () => {
    pushMocks({
      readdir: [
        [
          { isDirectory: () => true, isFile: () => false, name: 'skill-b' } as ReaddirEntry,
          { isDirectory: () => true, isFile: () => false, name: 'skill-a' } as ReaddirEntry,
        ],
        [],
        [],
      ],
      readFile: [
        '---\\ndescription: "Test"\\n---\\n# Skill',
        '---\\ndescription: "Test"\\n---\\n# Skill',
      ],
      stat: [
        { mtimeMs: 1000 } as StatResult,
        { mtimeMs: 1000 } as StatResult,
      ],
    });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });

    expect(result).toHaveLength(2);
    expect(result[0].skillName).toBe('skill-a');
    expect(result[1].skillName).toBe('skill-b');
  });

  it('re-throws non-ENOENT errors from readdir', async () => {
    pushMocks({ readdir: [Promise.reject(new Error('EACCES')) as ReaddirEntry[]] });

    await expect(listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null }))
      .rejects.toThrow('EACCES');
  });

  it('includes file count from nested skill directory', async () => {
    pushMocks({
      readdir: [
        [{ isDirectory: () => true, isFile: () => false, name: 'nested-skill' } as ReaddirEntry],
        [
          { isDirectory: () => true, isFile: () => false, name: 'subdir' } as ReaddirEntry,
          { isDirectory: () => false, isFile: () => true, name: 'SKILL.md' } as ReaddirEntry,
        ],
        [{ isDirectory: () => false, isFile: () => true, name: 'helper.ts' } as ReaddirEntry],
      ],
      readFile: ['---\\ndescription: "Nested"\\n---\\n# Nested'],
      stat: [{ mtimeMs: 500 } as StatResult],
    });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });

    expect(result).toHaveLength(1);
    expect(result[0].fileCount).toBe(2); // SKILL.md + subdir/helper.ts
  });

  it('records correct mtime from SKILL.md stat', async () => {
    pushMocks({
      readdir: [
        [{ isDirectory: () => true, isFile: () => false, name: 'skill-x' } as ReaddirEntry],
        [],
      ],
      readFile: ['---\\ndescription: "Test"\\n---\\n# X'],
      stat: [{ mtimeMs: 999999 } as StatResult],
    });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });

    expect(result[0].updatedAt).toBe(999999);
  });
});

describe('installAgentWorkspaceSkillsFromZip', () => {
  beforeEach(() => {
    mockReplies.readdir.length = 0;
    mockReplies.readFile.length = 0;
    mockReplies.stat.length = 0;
    mockReplies.rm.length = 0;
    vi.clearAllMocks();
  });

  it('passes correct arguments to archive installer', async () => {
    vi.mocked(installAgentWorkspaceSkillsArchive).mockResolvedValueOnce(undefined);
    const archive = zipSync({ 'skills/test-skill/SKILL.md': new Uint8Array() });

    await installAgentWorkspaceSkillsFromZip({
      workspaceBasePath: '/mock',
      agent: { id: 'agent-1', workspaceFilesystem: null },
      zipBase64: archive.toString('base64'),
    });

    expect(installAgentWorkspaceSkillsArchive).toHaveBeenCalledWith({
      workspaceBasePath: '/mock',
      agent: { id: 'agent-1', workspaceFilesystem: null },
      zipBase64: archive.toString('base64'),
    });
  });

  it('re-throws archive installation errors', async () => {
    vi.mocked(installAgentWorkspaceSkillsArchive).mockRejectedValueOnce(new Error('Disk full'));
    const archive = zipSync({ 'SKILL.md': new Uint8Array() });

    await expect(
      installAgentWorkspaceSkillsFromZip({
        workspaceBasePath: '/mock',
        agent: { id: 'agent-1', workspaceFilesystem: null },
        zipBase64: archive.toString('base64'),
      }),
    ).rejects.toThrow('Disk full');
  });
});

describe('deleteAgentWorkspaceSkill', () => {
  beforeEach(() => {
    mockReplies.readdir.length = 0;
    mockReplies.readFile.length = 0;
    mockReplies.stat.length = 0;
    mockReplies.rm.length = 0;
    vi.clearAllMocks();
  });

  it('removes the skill directory', async () => {
    fsMocks.rm.mockResolvedValueOnce(undefined);

    await deleteAgentWorkspaceSkill({
      workspaceBasePath: '/mock',
      agent: { id: 'agent-1', workspaceFilesystem: null },
      skillName: 'my-skill',
    });

    expect(fsMocks.rm).toHaveBeenCalledOnce();
    expect(fsMocks.rm).toHaveBeenCalledWith(
      '/mock/agent-1/workspace/skills/my-skill',
      expect.objectContaining({ recursive: true }),
    );
  });

  it('re-throws errors from rm', async () => {
    fsMocks.rm.mockRejectedValueOnce(new Error('EACCES'));

    await expect(
      deleteAgentWorkspaceSkill({
        workspaceBasePath: '/mock',
        agent: { id: 'agent-1', workspaceFilesystem: null },
        skillName: 'my-skill',
      }),
    ).rejects.toThrow('EACCES');
  });

  it('throws when skillName would traverse outside skillsRoot', async () => {
    fsMocks.rm.mockResolvedValueOnce(undefined);

    await expect(
      deleteAgentWorkspaceSkill({
        workspaceBasePath: '/mock',
        agent: { id: 'agent-1', workspaceFilesystem: null },
        skillName: '../../../etc/passwd',
      }),
    ).rejects.toThrow('Invalid skill name');
  });

  it('throws when resolveAgentSkillRoot returns mixed absolute/relative paths', async () => {
    const { resolveAgentSkillRoot } = await import('./workspace-skill-paths');
    vi.mocked(resolveAgentSkillRoot).mockReturnValueOnce({
      skillsRoot: 'relative/path/workspace/skills',
      skillRoot: '/absolute/path/my-skill',
    });

    await expect(
      deleteAgentWorkspaceSkill({
        workspaceBasePath: '/mock',
        agent: { id: 'agent-1', workspaceFilesystem: null },
        skillName: 'my-skill',
      }),
    ).rejects.toThrow('Invalid skill name');
  });
});

describe('parseSkillMetadata edge cases', () => {
  beforeEach(() => {
    mockReplies.readdir.length = 0;
    mockReplies.readFile.length = 0;
    mockReplies.stat.length = 0;
    mockReplies.rm.length = 0;
    vi.clearAllMocks();
  });

  it('handles empty metadata when frontmatter is missing', async () => {
    pushMocks({
      readdir: [
        [{ isDirectory: () => true, isFile: () => false, name: 'skill' } as ReaddirEntry],
        [],
      ],
      readFile: ['# My Skill\\nNo metadata here'],
      stat: [{ mtimeMs: 1 } as StatResult],
    });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });

    expect(result).toHaveLength(1);
    expect(result[0].description).toBeUndefined();
  });

  it('omits description when frontmatter has no description key', async () => {
    // 'x-no-colon' triggers separatorIndex === -1 in parseSkillMetadata
    pushMocks({
      readdir: [
        [{ isDirectory: () => true, isFile: () => false, name: 'skill' } as ReaddirEntry],
        [],
      ],
      readFile: ['---\nx-no-colon\nversion: "1.0"\n---\n# Skill'],
      stat: [{ mtimeMs: 300 } as StatResult],
    });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });

    expect(result).toHaveLength(1);
    expect(result[0].description).toBeUndefined();
  });

  it('handles unparseable YAML gracefully', async () => {
    pushMocks({
      readdir: [
        [{ isDirectory: () => true, isFile: () => false, name: 'skill' } as ReaddirEntry],
        [],
      ],
      readFile: ['---\\n  description: "Test"\\ninvalid yaml here:  [unclosed'],
      stat: [{ mtimeMs: 1 } as StatResult],
    });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });

    expect(result).toHaveLength(1);
    expect(result[0].description).toBeUndefined();
  });

  it('covers isFile branch in countSkillFiles', async () => {
    pushMocks({
      readdir: [
        [{ isDirectory: () => true, isFile: () => false, name: 'skill' } as ReaddirEntry],
        [
          { isDirectory: () => true, isFile: () => false, name: 'utils' } as ReaddirEntry,
          { isDirectory: () => false, isFile: () => true, name: 'SKILL.md' } as ReaddirEntry,
        ],
        [{ isDirectory: () => false, isFile: () => true, name: 'helper.ts' } as ReaddirEntry],
      ],
      readFile: ['---\\ndescription: "X"\\n---\\n# X'],
      stat: [{ mtimeMs: 1 } as StatResult],
    });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });

    expect(result).toHaveLength(1);
    expect(result[0].fileCount).toBe(2); // SKILL.md + utils/helper.ts
  });
});

describe('parseSkillMetadata direct coverage', () => {
  // parseSkillMetadata is private but exercised indirectly.
  // Line 24: content starts with --- but lacks closing ---  
  it('handles content with opening frontmatter but missing closing tag', async () => {
    // Content starts with --- but has no closing ---  
    pushMocks({
      readdir: [[{ isDirectory: () => true, isFile: () => false, name: 'skill' } as ReaddirEntry], []],
      readFile: ['---\n  description: Test\n# No closing marker'],
      stat: [{ mtimeMs: 42 } as StatResult],
    });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });
    expect(result).toHaveLength(1);
    expect(result[0].description).toBeUndefined();
  });

  // Line 42: separatorIndex === -1 in parseSkillMetadata loop
  it('handles a frontmatter line with no colon separator', async () => {
    // x-no-colon has no colon, triggering separatorIndex === -1
    pushMocks({
      readdir: [[{ isDirectory: () => true, isFile: () => false, name: 'skill' } as ReaddirEntry], []],
      readFile: ['---\nx-no-colon\nversion: "1.0"\n---\n# Skill'],
      stat: [{ mtimeMs: 99 } as StatResult],
    });

    const result = await listAgentWorkspaceSkills('/mock', { id: 'agent-1', workspaceFilesystem: null });
    expect(result).toHaveLength(1);
    expect(result[0].description).toBeUndefined();
  });
});

