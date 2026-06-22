import { describe, expect, it, vi, beforeEach } from 'vitest';
import path from 'node:path';
type ReaddirEntry = { name: string; isDirectory: () => boolean; isFile: () => boolean };
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
    if (mockReplies.access.length === 0)
      return Promise.reject(new Error('access not mocked')) as never;
    const err = mockReplies.access.shift()!;
    return err ? Promise.reject(err) : (Promise.resolve() as never);
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
    if (mockReplies.copyFile.length === 0)
      return Promise.reject(new Error('copyFile not mocked')) as never;
    const err = mockReplies.copyFile.shift()!;
    return err ? Promise.reject(err) : (Promise.resolve() as never);
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

    errorMsg: vi.fn((err) => err instanceof Error ? err.message : typeof err === "string" ? err : String(err).replace(/^Error: /, "")),
    withToolErrorLogging: vi.fn(async (params) => {
      try {
        return { valid: true, data: await params.fn() };
      } catch (error) {
        // Mirror the real impl: use errorMsg-style formatting
        const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error).replace(/^Error: /, '');
        return { valid: false, error: msg, hint: params.hint || '' };
      }
    }),
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
      access: [null as any],
      readdir: [[{ name: 'SKILL.md', isDirectory: () => false, isFile: () => true } as any]],
      readFile: [`name: github-api\n---\n# Skill`], // no '---\n' prefix
    });
    await expect(
      bundledWorkspaceSkills.ensureBundledWorkspaceSkills('/agent/workspace'),
    ).rejects.toThrow('Bundled skill is missing YAML frontmatter');
  });

  it('throws when frontmatter lacks closing marker', async () => {
    pushReplies({
      access: [null as any],
      readdir: [[{ name: 'SKILL.md', isDirectory: () => false, isFile: () => true } as any]],
      readFile: [`---\nname: github-api\n# No closing marker`],
    });
    await expect(
      bundledWorkspaceSkills.ensureBundledWorkspaceSkills('/agent/workspace'),
    ).rejects.toThrow('Bundled skill frontmatter is not closed');
  });

  it('throws when frontmatter is missing name key', async () => {
    pushReplies({
      access: [null as any],
      readdir: [[{ name: 'SKILL.md', isDirectory: () => false, isFile: () => true } as any]],
      readFile: [`---\ndescription: GitHub API skill\n---\n# Skill`],
    });
    await expect(
      bundledWorkspaceSkills.ensureBundledWorkspaceSkills('/agent/workspace'),
    ).rejects.toThrow('Bundled skill frontmatter is missing name');
  });
});

// ─── resolveBundledSkillRoot ──────────────────────────────────────────────────
describe('resolveBundledSkillRoot (walk-up search, L#NN-16 fix #5686)', () => {
  it('resolves skill root from walk-up search (1 access call)', async () => {
    pushReplies({ access: [null as any] });
    const root = await bundledWorkspaceSkills.resolveBundledSkillRoot('github-api');
    expect(fsMocks.access).toHaveBeenCalledOnce();
    expect(root).toContain('github-api');
  });

  it('throws when specific skill not found in resolved skills folder', async () => {
    pushReplies({ access: [new Error('ENOENT')] });
    await expect(bundledWorkspaceSkills.resolveBundledSkillRoot('github-api')).rejects.toThrow(
      'Bundled skill source not found',
    );
    expect(fsMocks.access).toHaveBeenCalledOnce();
  });

  it('calls forgeDebug on ENOENT failures', async () => {
    const { forgeDebug } = await import('@forge-runtime/core');
    pushReplies({ access: [new Error('ENOENT')] });
    await expect(bundledWorkspaceSkills.resolveBundledSkillRoot('github-api')).rejects.toThrow();
    expect(forgeDebug).toHaveBeenCalled();
  });
});

// ─── findSkillsFolder (L#19 tripwire for #5686) ─────────────────────────────
import { findSkillsFolder } from './bundled-workspace-skills';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

describe('findSkillsFolder (L#19 tripwire for #5686 L#NN-16 fix)', () => {
  test('finds skills folder in dev layout (1 level up from src/agents/)', () => {
    // Resolve from the test file's location, simulating the SOURCE layout
    const devStart = path.dirname(new URL(import.meta.url).pathname);
    const result = findSkillsFolder(devStart);
    // Dev: src/agents/bundled-workspace-skills.test.ts -> src/agents/skills/ (1 level up)
    expect(result.endsWith('skills')).toBe(true);
    expect(result.endsWith('src/agents/skills')).toBe(true);
  });

  test('finds skills folder in bundled layout (walk-up from dist/agents/)', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'forge-skills-test-'));
    try {
      // Create fake bundled layout: tmp/dist/agents/ + tmp/dist/agents/skills/github-api/SKILL.md
      const fakeAgentsDir = path.join(tmp, 'dist', 'agents');
      const fakeSkillsDir = path.join(fakeAgentsDir, 'skills');
      const fakeGithubApiDir = path.join(fakeSkillsDir, 'github-api');
      const fsSync = require('node:fs') as typeof import('node:fs');
      fsSync.mkdirSync(fakeGithubApiDir, { recursive: true });
      fsSync.writeFileSync(path.join(fakeGithubApiDir, 'SKILL.md'), '---\nname: github-api\n---');

      const result = findSkillsFolder(fakeAgentsDir);
      // Should find tmp/dist/agents/skills
      expect(result).toBe(fakeSkillsDir);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('throws when skills folder not found within 5 levels', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'forge-skills-empty-'));
    try {
      // Empty temp dir with no skills/ anywhere
      expect(() => findSkillsFolder(tmp)).toThrow(
        /skills\/github-api\/SKILL\.md not found/,
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('does NOT use hardcoded .. .. path (L#NN-16 regression guard)', () => {
    // Negative test: if someone reverts to the buggy
    // `join(import.meta.dirname, '..', '..', 'skills')`, the bundled
    // layout test (above) would fail because dist/agents/ + ../../skills
    // would point to <grandparent>/skills (NOT dist/agents/skills/).
    const source = readFileSource();
    expect(source).not.toMatch(
      /join\(import\.meta\.dirname,\s*['"]\.\.['"],\s*['"]\.\.['"],\s*['"]skills['"]\)/,
    );
    expect(source).toMatch(/findSkillsFolder\(MODULE_DIRECTORY\)/);
  });
});

// Helper to read the source of bundled-workspace-skills.ts for negative assertions
function readFileSource(): string {
  const fsSync = require('node:fs') as typeof import('node:fs');
  const pathMod = require('node:path') as typeof import('node:path');
  const sourcePath = pathMod.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    'bundled-workspace-skills.ts',
  );
  return fsSync.readFileSync(sourcePath, 'utf-8');
}
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
        [{ name: 'file.txt', isDirectory: () => false, isFile: () => true } as ReaddirEntry],
      ],
      copyFile: [null as any],
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
      copyFile: [null as any, null as any],
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
        [{ name: 'file.txt', isDirectory: () => false, isFile: () => true } as ReaddirEntry],
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
      access: [null as any, null as any, null as any],
      readdir: [
        [{ name: 'SKILL.md', isDirectory: () => false, isFile: () => true } as ReaddirEntry],
        [],
        [],
      ],
      readFile: [
        `---\nname: github-api\n---\n# Skill`,
        `---\nname: coolify-api\n---\n# Skill`,
        `---\nname: skills-creator\n---\n# Skill`,
      ],
      copyFile: [null as any],
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
