import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ReaddirEntry } from 'node:fs/promises';
import { copyDirectoryContents } from './bundled-workspace-skills';
import * as bundledWorkspaceSkills from './bundled-workspace-skills';

// ─── Mock queues ────────────────────────────────────────────────────────────────
const mockReplies: {
  access: Error[];
  readdir: ReaddirEntry[][];
  readFile: string[];
  copyFile: Error[];
} = {
  access: [],
  readdir: [],
  readFile: [],
  copyFile: [],
};

const fsMocks = vi.hoisted(() => ({
  access: vi.fn<() => Promise<void>>(() => {
    if (mockReplies.access.length === 0) return Promise.reject(new Error('access not mocked')) as never;
    const err = mockReplies.access.shift()!;
    return err ? Promise.reject(err) : Promise.resolve() as never;
  }),
  readdir: vi.fn<() => Promise<ReaddirEntry[]>>(() => {
    if (mockReplies.readdir.length === 0) return Promise.resolve([]) as never;
    return Promise.resolve(mockReplies.readdir.shift()!) as never;
  }),
  readFile: vi.fn<() => Promise<string>>(() => {
    if (mockReplies.readFile.length === 0) return Promise.resolve('') as never;
    return Promise.resolve(mockReplies.readFile.shift()!) as never;
  }),
  mkdir: vi.fn<() => Promise<void>>(),
  copyFile: vi.fn<() => Promise<void>>(() => {
    if (mockReplies.copyFile.length === 0) return Promise.reject(new Error('copyFile not mocked')) as never;
    const err = mockReplies.copyFile.shift()!;
    return err ? Promise.reject(err) : Promise.resolve() as never;
  }),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    access: fsMocks.access,
    readdir: fsMocks.readdir,
    readFile: fsMocks.readFile,
    mkdir: fsMocks.mkdir,
    copyFile: fsMocks.copyFile,
  },
  access: fsMocks.access,
  readdir: fsMocks.readdir,
  readFile: fsMocks.readFile,
  mkdir: fsMocks.mkdir,
  copyFile: fsMocks.copyFile,
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

beforeEach(() => {
  mockReplies.access.length = 0;
  mockReplies.readdir.length = 0;
  mockReplies.readFile.length = 0;
  mockReplies.copyFile.length = 0;
  vi.clearAllMocks();
});

// ─── BUNDLED_SKILL_DIRECTORY_NAMES ────────────────────────────────────────────
describe('BUNDLED_SKILL_DIRECTORY_NAMES', () => {
  it('exports the three expected skill directory names', () => {
    expect(bundledWorkspaceSkills.BUNDLED_SKILL_DIRECTORY_NAMES).toEqual([
      'github-api',
      'coolify-api',
      'skills-creator',
    ]);
  });
});

// ─── parseSkillName (via ensureBundledWorkspaceSkills) ────────────────────────
// parseSkillName is not exported — exercise it through ensureBundledWorkspaceSkills.
// It throws when:
// - content does not start with '---\n'
// - frontmatter lacks closing '\n---\n'
// - name key is missing from frontmatter

describe('parseSkillName error cases', () => {
  it('throws when SKILL.md lacks opening frontmatter marker', async () => {
    pushReplies({
      access: [null],
      readdir: [[{ name: 'SKILL.md', isDirectory: () => false, isFile: () => true } as ReaddirEntry]],
      readFile: [`name: github-api\n---\n# Skill`], // no '---\n' prefix
    });
    await expect(
      bundledWorkspaceSkills.ensureBundledWorkspaceSkills('/agent/workspace'),
    ).rejects.toThrow('Bundled skill is missing YAML frontmatter');
  });

  it('throws when frontmatter lacks closing marker', async () => {
    pushReplies({
      access: [null],
      readdir: [[{ name: 'SKILL.md', isDirectory: () => false, isFile: () => true } as ReaddirEntry]],
      readFile: [`---\nname: github-api\n# No closing marker`],
    });
    await expect(
      bundledWorkspaceSkills.ensureBundledWorkspaceSkills('/agent/workspace'),
    ).rejects.toThrow('Bundled skill frontmatter is not closed');
  });

  it('throws when frontmatter is missing name key', async () => {
    pushReplies({
      access: [null],
      readdir: [[{ name: 'SKILL.md', isDirectory: () => false, isFile: () => true } as ReaddirEntry]],
      readFile: [`---\ndescription: GitHub API skill\n---\n# Skill`],
    });
    await expect(
      bundledWorkspaceSkills.ensureBundledWorkspaceSkills('/agent/workspace'),
    ).rejects.toThrow('Bundled skill frontmatter is missing name');
  });
});

// ─── resolveBundledSkillRoot ──────────────────────────────────────────────────
describe('resolveBundledSkillRoot', () => {
  it('returns first accessible candidate root', async () => {
    pushReplies({ access: [null] });
    const root = await bundledWorkspaceSkills.resolveBundledSkillRoot('github-api');
    expect(fsMocks.access).toHaveBeenCalledOnce();
    expect(root).toContain('github-api');
  });

  it('falls through inaccessible candidates until one succeeds', async () => {
    pushReplies({ access: [new Error('ENOENT'), new Error('ENOENT'), null] });
    const root = await bundledWorkspaceSkills.resolveBundledSkillRoot('github-api');
    expect(fsMocks.access).toHaveBeenCalledTimes(3);
    expect(root).toContain('github-api');
  });

  it('throws when no candidate root is accessible', async () => {
    pushReplies({
      access: [new Error('ENOENT'), new Error('ENOENT'), new Error('ENOENT')],
    });
    await expect(
      bundledWorkspaceSkills.resolveBundledSkillRoot('github-api'),
    ).rejects.toThrow('Bundled skill source not found');
    expect(fsMocks.access).toHaveBeenCalledTimes(3);
  });

  it('calls forgeDebug on ENOENT failures', async () => {
    const { forgeDebug } = await import('@forge-runtime/core');
    pushReplies({
      access: [new Error('ENOENT'), new Error('ENOENT'), new Error('ENOENT')],
    });
    await expect(
      bundledWorkspaceSkills.resolveBundledSkillRoot('github-api'),
    ).rejects.toThrow();
    expect(forgeDebug).toHaveBeenCalled();
  });
});

// ─── copyDirectoryContents ────────────────────────────────────────────────────
describe('copyDirectoryContents', () => {
  it('creates target directory recursively', async () => {
    pushReplies({ readdir: [[]] });
    await copyDirectoryContents('/source', '/target');
    expect(fsMocks.mkdir).toHaveBeenCalledWith('/target', { recursive: true });
  });

  it('copies files to target', async () => {
    pushReplies({
      readdir: [
        [
          { name: 'file.txt', isDirectory: () => false, isFile: () => true } as ReaddirEntry,
        ],
      ],
      copyFile: [null],
    });
    await copyDirectoryContents('/source', '/target');
    expect(fsMocks.copyFile).toHaveBeenCalledWith('/source/file.txt', '/target/file.txt');
  });

  it('recursively copies subdirectories', async () => {
    pushReplies({
      readdir: [
        [
          { name: 'file.txt', isDirectory: () => false, isFile: () => true } as ReaddirEntry,
          { name: 'subdir', isDirectory: () => true, isFile: () => false } as ReaddirEntry,
        ],
        [{ name: 'nested.txt', isDirectory: () => false, isFile: () => true } as ReaddirEntry],
      ],
      copyFile: [null, null],
    });
    await copyDirectoryContents('/source', '/target');
    expect(fsMocks.mkdir).toHaveBeenCalledWith('/target/subdir', { recursive: true });
    expect(fsMocks.copyFile).toHaveBeenCalledWith('/source/file.txt', '/target/file.txt');
    expect(fsMocks.copyFile).toHaveBeenCalledWith(
      '/source/subdir/nested.txt',
      '/target/subdir/nested.txt',
    );
  });

  it('propagates copyFile error', async () => {
    pushReplies({
      readdir: [
        [
          { name: 'file.txt', isDirectory: () => false, isFile: () => true } as ReaddirEntry,
        ],
      ],
      copyFile: [new Error('EACCES')],
    });
    await expect(copyDirectoryContents('/source', '/target')).rejects.toThrow('EACCES');
  });
});

// ─── ensureBundledWorkspaceSkills ─────────────────────────────────────────────
describe('ensureBundledWorkspaceSkills', () => {
  it('installs all three bundled skills', async () => {
    // Each skill: access (resolveBundledSkillRoot) + readdir+readFile (installBundledSkill)
    pushReplies({
      access: [null, null, null],
      readdir: [[{ name: 'SKILL.md', isDirectory: () => false, isFile: () => true } as ReaddirEntry], [], []],
      readFile: [`---\nname: github-api\n---\n# Skill`, `---\nname: coolify-api\n---\n# Skill`, `---\nname: skills-creator\n---\n# Skill`],
      copyFile: [null],
    });
    await bundledWorkspaceSkills.ensureBundledWorkspaceSkills('/agent/workspace');
    expect(fsMocks.access).toHaveBeenCalledTimes(3);
    expect(fsMocks.mkdir).toHaveBeenCalledTimes(3);
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────
function pushReplies(replies: {
  access?: Error[];
  readdir?: ReaddirEntry[][];
  readFile?: string[];
  copyFile?: Error[];
}) {
  if (replies.access) mockReplies.access.push(...replies.access);
  if (replies.readdir) mockReplies.readdir.push(...replies.readdir);
  if (replies.readFile) mockReplies.readFile.push(...replies.readFile);
  if (replies.copyFile) mockReplies.copyFile.push(...replies.copyFile);
}
