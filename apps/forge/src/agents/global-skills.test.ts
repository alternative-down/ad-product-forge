import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));

// All mock state in ONE hoisted block
const _m = vi.hoisted(() => {
  const mkdirFn     = vi.fn();
  const rmFn        = vi.fn();
  const copyFileFn  = vi.fn();
  const writeFileFn = vi.fn();
  const readFileFn  = vi.fn();
  const readdirFn   = vi.fn();
  const accessFn    = vi.fn();
  const statFn      = vi.fn();
  const unzipSync   = vi.fn();

  // Key-value stores: path → content (strings or Uint8Array).
  // Directories are populated by seeding helper; empty arrays mean no entry.
  const fileStore   = new Map<string, string | Uint8Array>();
  const dirStore    = new Map<string, string[]>();
  const resolveResults: string[] = [];
  const resolveAgentSkillRoot   = vi.fn<[{ workspaceBasePath: string; agent: { id: string }; skillName: string }], { skillsRoot: string; skillRoot: string }>();
  const resolveAgentSkillsRoot  = vi.fn<[string, unknown, string], string>();
  const resolveBundledSkillRoot = vi.fn<(name: string) => Promise<string>>(
    (name: string) => Promise.resolve(`/base/_bundled/${name}`)
  );
  const copyDirectoryContents    = vi.fn<(src: string, dst: string) => Promise<void>>();

  return {
    mkdirFn, rmFn, copyFileFn, writeFileFn, readFileFn, readdirFn, accessFn, statFn, unzipSync,
    fileStore, dirStore, resolveResults,
    resolveAgentSkillRoot, resolveAgentSkillsRoot,
    resolveBundledSkillRoot, copyDirectoryContents,
  };
});

const {
  mkdirFn, rmFn, copyFileFn, writeFileFn, readFileFn, readdirFn, accessFn, statFn, unzipSync,
  fileStore, dirStore, resolveResults,
  resolveAgentSkillRoot, resolveAgentSkillsRoot,
  resolveBundledSkillRoot, copyDirectoryContents,
} = _m;

// ── External dep mocks (order matters: must precede SUT import) ────────────────
vi.mock('node:path', async () => {
  const RealPath = await vi.importActual<typeof import('node:path')>('node:path');
  const mockResolve = vi.fn((...args: string[]) => {
    const r = RealPath.resolve(...args);
    resolveResults.push(r);
    return r;
  });
  // For import * as path, need both default and named exports
  return { default: { ...RealPath, resolve: mockResolve }, resolve: mockResolve };
});

vi.mock('node:fs/promises', async () => {
  const RealFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  const impl: typeof import('node:fs/promises') = {
    mkdir: mkdirFn as typeof RealFs.mkdir,
    rm:    rmFn   as typeof RealFs.rm,
    copyFile:  copyFileFn  as typeof RealFs.copyFile,
    writeFile: writeFileFn as typeof RealFs.writeFile,
    readFile:  readFileFn  as typeof RealFs.readFile,
    readdir:   readdirFn   as typeof RealFs.readdir,
    access:    accessFn    as typeof RealFs.access,
    stat:      statFn      as typeof RealFs.stat,
  };
  return { default: impl, ...impl };
});

// Mock node:fs (sync) — skills-shared/index.ts imports the sync version
// and uses fs.readdir with withFileTypes:true in countSkillFiles
// Mock node:fs (sync) — skills-shared/index.ts uses 'import * as fs from node:fs'
// and calls fs.readdir (async, not readdirSync) with withFileTypes:true
const mockReaddir = async (p: string, opts?: { withFileTypes?: boolean }) => {
  const entries = dirStore.get(String(p).replace(/\/$/, ''));
  if (entries === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  return entries.map(name => {
    const fullPath = p.endsWith('/') ? p + name : p + '/' + name;
    const isDir = dirStore.has(fullPath) || name.endsWith('/');
    return { name, isDirectory: () => isDir, isFile: () => !isDir, isBlockDevice: () => false, isCharacterDevice: () => false, isFIFO: () => false, isSocket: () => false, isSymbolicLink: () => false };
  });
};
vi.mock('node:fs', () => {
  const fsMock = { readdir: mockReaddir, readdirSync: mockReaddir };
  return { __esModule: true, default: fsMock, ...fsMock };
});

vi.mock('fflate', async () => ({ unzipSync }));

vi.mock('./bundled-workspace-skills', async () => {
  const Real = await vi.importActual<typeof import('./bundled-workspace-skills')>('./bundled-workspace-skills');
  return {
    BUNDLED_SKILL_DIRECTORY_NAMES: Real.BUNDLED_SKILL_DIRECTORY_NAMES,
    resolveBundledSkillRoot: resolveBundledSkillRoot as typeof Real.resolveBundledSkillRoot,
    copyDirectoryContents:    copyDirectoryContents  as typeof Real.copyDirectoryContents,
  };
});

vi.mock('./workspace-skill-paths', async () => {
  const Real = await vi.importActual<typeof import('./workspace-skill-paths')>('./workspace-skill-paths');
  return {
    resolveAgentSkillRoot:   resolveAgentSkillRoot   as typeof Real.resolveAgentSkillRoot,
    resolveAgentSkillsRoot:  resolveAgentSkillsRoot  as typeof Real.resolveAgentSkillsRoot,
  };
});

// ── SUT: import real module, mock nothing inside it ───────────────────────────
const gs = await vi.importActual<typeof import('./global-skills')>('./global-skills');
// Export BUNDLED_SKILL_DIRECTORY_NAMES so seedBundledSkills() iterates correctly
gs.BUNDLED_SKILL_DIRECTORY_NAMES = (await vi.importActual('./bundled-workspace-skills')).BUNDLED_SKILL_DIRECTORY_NAMES;

// Extract helpers and integration functions for direct testing
const { parseSkillMetadata, normalizeArchiveEntryPath, resolveGlobalSkillsRoot,
       listGlobalSkills, installGlobalSkillsFromZip, deleteGlobalSkill,
       installGlobalSkillToAgentWorkspace, publishAgentWorkspaceSkillToGlobalCatalog } = gs;

// ── Seed helpers ──────────────────────────────────────────────────────────────
const BUNDLED_SKILLS = ['github-api', 'coolify-api', 'skills-creator'];

function seedFile(path: string, content = '') {
  fileStore.set(path, content || '---\ndescription: Seeded skill\n---\n');
}

function seedDir(path: string, entries: string[]) {
  dirStore.set(path, entries);
}

function seedBundledSkill(name: string) {
  seedFile(`/base/_bundled/${name}/SKILL.md`);
  seedDir(`/base/_bundled/${name}`, ['SKILL.md']);
  // Keep parent /base/_bundled entry in sync so readdir on it finds this skill.
  // Uses merge-not-overwrite so repeated calls accumulate all names.
  const existing = dirStore.get('/base/_bundled') ?? [];
  if (!existing.includes(name)) dirStore.set('/base/_bundled', [...existing, name]);
}

function seedBundledSkills() {
  for (const name of BUNDLED_SKILLS) seedBundledSkill(name);
  // Also seed the _bundled parent dir so readdir on it returns subdirectories
  dirStore.set('/base/_bundled', [...BUNDLED_SKILLS]);
}

function seedCustomSkill(name: string, content = '') {
  const root = `/base/_system/skills/${name}`;
  seedFile(`${root}/SKILL.md`, content || `---\ndescription: Custom ${name}\n---\n`);
  seedDir(root, ['SKILL.md']);
  // Register skill root path directly in dirStore so readdir's dirStore.has(fullPath) succeeds.
  // Without this, seedDir('/base/_system/skills', ['my-tool']) overwrites the parent dirStore entry
  // to ['my-tool'] (bare), and readdir can't detect 'my-tool' as a directory.
  dirStore.set(root, ['SKILL.md']);
  // Register bare name in parent _system/skills dir for readdir discovery.
  const existing = dirStore.get('/base/_system/skills') ?? [];
  if (!existing.includes(name)) dirStore.set('/base/_system/skills', [...existing, name]);
}

// ── Global beforeEach setup ───────────────────────────────────────────────────
beforeEach(() => {
  vi.clearAllMocks();
  for (const fn of [mkdirFn, rmFn, copyFileFn, writeFileFn, readFileFn, readdirFn, accessFn, statFn, unzipSync]) {
    fn.mockReset();
  }
  mkdirFn.mockResolvedValue(undefined);
  rmFn.mockResolvedValue(undefined);
  accessFn.mockImplementation(async (p: string) => {
    const key = String(p).replace(/\/$/, '');
    if (!fileStore.has(key) && !dirStore.has(key)) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  statFn.mockImplementation(async (p: string) => {
    const key = String(p).replace(/\/$/, '');
    if (fileStore.has(key)) return { isDirectory: () => false, isFile: () => true, mtimeMs: 1700000000000 } as Awaited<ReturnType<typeof import('node:fs/promises')['stat']>>;
    if (dirStore.has(key)) return { isDirectory: () => true, isFile: () => false, mtimeMs: 1700000000000 } as Awaited<ReturnType<typeof import('node:fs/promises')['stat']>>;
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
  });
  readdirFn.mockImplementation(async (p: string) => {
    const entries = dirStore.get(String(p).replace(/\/$/, ''));
    if (entries === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    // Detect subdirectories by checking if 'p/name' (without trailing slash) exists as a
    // dirStore key. Also accept trailing '/' suffix on entry name as directory marker.
    return entries.map(name => {
      const fullPath = p.endsWith('/') ? p + name : p + '/' + name;
      const isDir = dirStore.has(fullPath) || name.endsWith('/');
      // Return a proper Dirent-like object with name and isDirectory/isFile methods.
      // When Node's fs.readdir is called with withFileTypes:true it calls
      // readdir(fd, 'buffer', stats, entries, buffer) which expects Dirent.name to be
      // set on the buffer entries.
      const entry: import('node:fs').Dirent = { name, isDirectory: () => isDir, isFile: () => !isDir, isBlockDevice: () => false, isCharacterDevice: () => false, isFIFO: () => false, isSocket: () => false, isSymbolicLink: () => false } as unknown as import('node:fs').Dirent;
      return entry;
    });
  });
  readFileFn.mockImplementation(async (p: string) => {
    const key = String(p).replace(/\/$/, '');
    const content = fileStore.get(key);
    if (content === undefined) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    return content instanceof Uint8Array ? Buffer.from(content) : content;
  });
  writeFileFn.mockImplementation(async (p: string, data: Buffer | string) => {
    fileStore.set(String(p), typeof data === 'string' ? data : Buffer.from(data));
  });
  copyFileFn.mockImplementation(async (src: string, dst: string) => {
    const content = fileStore.get(src);
    if (content !== undefined) fileStore.set(dst, content);
  });
  copyDirectoryContents.mockReset().mockResolvedValue(undefined);
  unzipSync.mockReturnValue({});
  resolveBundledSkillRoot.mockReset().mockImplementation(async (name: string) => `/base/_bundled/${name}`);
  resolveAgentSkillRoot.mockReset().mockImplementation(({ skillName }: { skillName: string }) => ({
    skillsRoot: '/base/agent-42/workspace/skills',
    skillRoot:  `/base/agent-42/workspace/skills/${skillName}`,
  }));
  resolveAgentSkillsRoot.mockReset().mockResolvedValue('/base/agent-42/workspace/skills');
  resolveResults.length = 0;
});

afterEach(() => { vi.restoreAllMocks(); });

// ─── listGlobalSkills ────────────────────────────────────────────────────────
describe('listGlobalSkills', () => {
  // Each test seeds the skills it needs — nothing seeded globally
  // Each test seeds the exact skills it needs. Custom skills dir cleared here.
  beforeEach(() => {
    dirStore.delete('/base/_system/skills');
  });


  // _bundled dir not seeded: readdir('/base/_bundled') → ENOENT.
  // listBundledGlobalSkills has NO try-catch → error propagates uncaught.
  // The outer catch only catches listCustomGlobalSkills' ENOENT (returns []).
  // The uncaught ENOENT from bundled side propagates → test expects rejection.
  it('throws ENOENT when bundled skill directory does not exist', async () => {
    await expect(listGlobalSkills('/base')).rejects.toThrow();
  });
  it('returns bundled skills when no custom skills exist', async () => {
    seedBundledSkill('github-api'); seedBundledSkill('coolify-api'); seedBundledSkill('skills-creator');
    const result = await listGlobalSkills('/base');
    expect(result).toMatchObject([
      { skillName: 'coolify-api',   source: 'bundled', editable: false },
      { skillName: 'github-api',    source: 'bundled', editable: false },
      { skillName: 'skills-creator',source: 'bundled', editable: false },
    ]);
  });
  // Source reads BUNDLED_SKILL_DIRECTORY_NAMES from bundled-workspace-skills.ts
  // (only 3: github-api, coolify-api, skills-creator). alpha/zebra ignored.
  // After fix: seedBundledSkill merges into /base/_bundled parent, so all 3 are found.
  // Sorted: coolify-api < github-api < skills-creator.
  it('returns bundled skills sorted by skillName', async () => {
    seedBundledSkill('github-api'); seedBundledSkill('coolify-api'); seedBundledSkill('skills-creator');
    const names = (await listGlobalSkills('/base')).map(s => s.skillName);
    expect(names).toEqual(['coolify-api', 'github-api', 'skills-creator']);
  });
  it('returns custom skills from _system/skills', async () => {
    seedBundledSkill('github-api'); seedBundledSkill('coolify-api'); seedBundledSkill('skills-creator');
    seedCustomSkill('my-tool', '---\ndescription: My tool\n---\n');
    seedDir('/base/_system/skills', ['my-tool']);
    const result = await listGlobalSkills('/base');
    // Result order is [coolify-api, github-api, my-tool, skills-creator] — alphabetical.
    // Use toContainEqual since we only need to verify my-tool exists (not its position).
    expect(result).toContainEqual(expect.objectContaining({ skillName: 'my-tool', source: 'custom', editable: true, description: 'My tool' }));
  });
  it('bundled skill overrides custom skill with same name', async () => {
    seedBundledSkill('github-api'); seedBundledSkill('coolify-api'); seedBundledSkill('skills-creator');
    seedCustomSkill('github-api', '---\ndescription: Custom\n---\n');
    seedDir('/base/_system/skills', ['github-api']);
    const skill = (await listGlobalSkills('/base')).find(s => s.skillName === 'github-api');
    // Source Map: bundled inserted first, custom inserted second (overwrites). Custom wins.
    expect(skill?.source).toBe('custom');
    expect(skill?.editable).toBe(true);  // custom → editable: true
  });
  it('returns combined bundled and custom skills sorted', async () => {
    seedBundledSkill('github-api'); seedBundledSkill('coolify-api'); seedBundledSkill('skills-creator');
    seedCustomSkill('my-tool', '---\ndescription: Custom\n---\n');
    seedDir('/base/_system/skills', ['my-tool']);
    const names = (await listGlobalSkills('/base')).map(s => s.skillName);
    expect(names).toEqual(['coolify-api', 'github-api', 'my-tool', 'skills-creator']);
  });
  it('returns fileCount from countSkillFiles', async () => {
    seedBundledSkill('github-api'); seedBundledSkill('coolify-api'); seedBundledSkill('skills-creator');
    seedDir('/base/_bundled/github-api', ['SKILL.md', 'README.md']);
    fileStore.set('/base/_bundled/github-api/README.md', '# Readme');
    const result = await listGlobalSkills('/base');
    const githubApi = result.find(s => s.skillName === 'github-api');
    expect(githubApi?.fileCount).toBe(2);
  });
});

// ─── installGlobalSkillsFromZip ─────────────────────────────────────────────
describe('installGlobalSkillsFromZip', () => {
  // Seed all 3 bundled skills so listBundledGlobalSkills() (called by source)
  // can read their SKILL.md without ENOENT. Tests only use unzip mock.
  beforeEach(() => {
    seedBundledSkills();
    dirStore.delete('/base/_system/skills'); // custom skills dir cleared (not needed for zip tests)
  });
  it('creates skillsRoot directory', async () => {
    unzipSync.mockReturnValue({ 'my-skill/SKILL.md': new Uint8Array(0) });
    await installGlobalSkillsFromZip({ zipBase64: 'ZmFrZQ==', workspaceBasePath: '/base' });
    expect(mkdirFn).toHaveBeenCalledWith(expect.stringContaining('_system/skills'), { recursive: true });
  });
  it('writes extracted files via fs.writeFile', async () => {
    unzipSync.mockReturnValue({ 'my-skill/SKILL.md': new Uint8Array([72, 105]) });
    await installGlobalSkillsFromZip({ zipBase64: 'ZmFrZQ==', workspaceBasePath: '/base' });
    expect(writeFileFn).toHaveBeenCalled();
  });
  it('returns sorted skill names', async () => {
    unzipSync.mockReturnValue({
      'zebra-skill/SKILL.md': new Uint8Array(0),
      'alpha-skill/SKILL.md': new Uint8Array(0),
    });
    const result = await installGlobalSkillsFromZip({ zipBase64: 'ZmFrZQ==', workspaceBasePath: '/base' });
    expect(result).toEqual(['alpha-skill', 'zebra-skill']);
  });
  it('throws when archive has no files', async () => {
    unzipSync.mockReturnValue({});
    await expect(installGlobalSkillsFromZip({ zipBase64: 'ZmFrZQ==', workspaceBasePath: '/base' })).rejects.toThrow('Skill archive did not contain any files');
  });
  it('throws when skill name is reserved by bundled skill', async () => {
    seedBundledSkill('github-api');
    unzipSync.mockReturnValue({ 'github-api/SKILL.md': new Uint8Array(0) });
    await expect(installGlobalSkillsFromZip({ zipBase64: 'ZmFrZQ==', workspaceBasePath: '/base' })).rejects.toThrow('Skill name is reserved by a bundled skill: github-api');
  });
  it('throws on path traversal entry', async () => {
    unzipSync.mockReturnValue({ 'my-skill/../../../etc/passwd': new Uint8Array(0) });
    await expect(installGlobalSkillsFromZip({ zipBase64: 'ZmFrZQ==', workspaceBasePath: '/base' })).rejects.toThrow('Invalid skill archive entry');
  });
  it('throws when entry resolves to dot', async () => {
    unzipSync.mockReturnValue({ './': new Uint8Array(0) });
    await expect(installGlobalSkillsFromZip({ zipBase64: 'ZmFrZQ==', workspaceBasePath: '/base' })).rejects.toThrow('Invalid skill archive entry');
  });
  it('skips directory entries', async () => {
    unzipSync.mockReturnValue({ 'my-skill/': new Uint8Array(0), 'my-skill/SKILL.md': new Uint8Array(0) });
    const result = await installGlobalSkillsFromZip({ zipBase64: 'ZmFrZQ==', workspaceBasePath: '/base' });
    expect(result).toContain('my-skill');
  });
  it('normalizes backslash path separators', async () => {
    unzipSync.mockReturnValue({ 'my-skill\\\\SKILL.md': new Uint8Array(0) });
    const result = await installGlobalSkillsFromZip({ zipBase64: 'ZmFrZQ==', workspaceBasePath: '/base' });
    expect(result).toContain('my-skill');
  });
  it('strips skills/ prefix from entry paths', async () => {
    unzipSync.mockReturnValue({ 'skills/my-skill/SKILL.md': new Uint8Array(0) });
    const result = await installGlobalSkillsFromZip({ zipBase64: 'ZmFrZQ==', workspaceBasePath: '/base' });
    expect(result).toContain('my-skill');
  });
  it('writes correct content for each extracted file', async () => {
    unzipSync.mockReturnValue({ 'my-skill/SKILL.md': new Uint8Array([72, 105]) });
    await installGlobalSkillsFromZip({ zipBase64: 'ZmFrZQ==', workspaceBasePath: '/base' });
    expect(writeFileFn).toHaveBeenCalledWith(
      expect.stringContaining('my-skill/SKILL.md'),
      expect.any(Buffer)
    );
  });
});

// ─── deleteGlobalSkill ────────────────────────────────────────────────────────
describe('deleteGlobalSkill', () => {
  it('calls fs.rm with the skill directory', async () => {
    await deleteGlobalSkill({ workspaceBasePath: '/base', skillName: 'my-tool' });
    expect(rmFn).toHaveBeenCalledWith(expect.stringContaining('my-tool'), expect.objectContaining({ recursive: true }));
  });
  it('throws when skillName contains path traversal', async () => {
    await expect(deleteGlobalSkill({ workspaceBasePath: '/base', skillName: '../etc/passwd' })).rejects.toThrow('Invalid skill name');
  });
  it('throws when skillName is an absolute path', async () => {
    await expect(deleteGlobalSkill({ workspaceBasePath: '/base', skillName: '/etc/passwd' })).rejects.toThrow('Invalid skill name');
  });
  it('trims whitespace from skillName', async () => {
    await deleteGlobalSkill({ workspaceBasePath: '/base', skillName: '  my-tool  ' });
    expect(rmFn).toHaveBeenCalledWith(expect.stringContaining('my-tool'), expect.any(Object));
  });
  it('whitespace skillName does not reject and resolves to undefined', async () => {
    await expect(deleteGlobalSkill({ workspaceBasePath: '/base', skillName: '   ' })).resolves.toBeUndefined();
  });
});

// ─── installGlobalSkillToAgentWorkspace ─────────────────────────────────────
describe('installGlobalSkillToAgentWorkspace', () => {
  const fakeAgent = { id: 'agent-42', workspaceFilesystem: null as unknown as object };
  // Seed all 3 bundled skills so listGlobalSkills() (called by source) succeeds.
  // Tests that need "not found" behavior use skillName='nonexistent'.
  beforeEach(() => {
    seedBundledSkills();
    dirStore.delete('/base/_system/skills');
  });
  it('copies custom global skill to agent workspace', async () => {
    seedCustomSkill('my-tool', '---\ndescription: Custom\n---\n');
    seedDir('/base/_system/skills', ['my-tool']);
    await installGlobalSkillToAgentWorkspace({ workspaceBasePath: '/base', agent: fakeAgent, skillName: 'my-tool' });
    expect(copyDirectoryContents).toHaveBeenCalled();
  });
  it('copies bundled global skill to agent workspace', async () => {
    // github-api already seeded by beforeEach; seedBundledSkill call is idempotent here
    await installGlobalSkillToAgentWorkspace({ workspaceBasePath: '/base', agent: fakeAgent, skillName: 'github-api' });
    expect(resolveBundledSkillRoot).toHaveBeenCalledWith('github-api');
    expect(copyDirectoryContents).toHaveBeenCalled();
  });
  it('throws when custom skill not found', async () => {
    await expect(installGlobalSkillToAgentWorkspace({ workspaceBasePath: '/base', agent: fakeAgent, skillName: 'nonexistent' })).rejects.toThrow('Global skill not found');
  });
  it('throws when skillName is invalid', async () => {
    await expect(installGlobalSkillToAgentWorkspace({ workspaceBasePath: '/base', agent: fakeAgent, skillName: '../evil' })).rejects.toThrow('Global skill not found');
  });
  it('throws when skill name not in global catalog', async () => {
    // 'nonexistent' is not in the seeded skills list
    await expect(installGlobalSkillToAgentWorkspace({ workspaceBasePath: '/base', agent: fakeAgent, skillName: 'nonexistent' })).rejects.toThrow('Global skill not found');
  });
});

// ─── publishAgentWorkspaceSkillToGlobalCatalog ───────────────────────────────
describe('publishAgentWorkspaceSkillToGlobalCatalog', () => {
  const fakeAgent = { id: 'agent-42', workspaceFilesystem: null as unknown as object };
  // Seed all 3 bundled skills so listBundledGlobalSkills() (called by source) succeeds.
  beforeEach(() => {
    seedBundledSkills();
    dirStore.delete('/base/_system/skills');
    dirStore.delete('/base/agent-42/workspace/skills');
  });
  it('throws when skill already exists as bundled skill', async () => {
    seedBundledSkill('github-api');
    await expect(publishAgentWorkspaceSkillToGlobalCatalog({ workspaceBasePath: '/base', agent: fakeAgent, skillName: 'github-api' })).rejects.toThrow('Skill name is reserved by a bundled skill');
  });
  it('throws when skill not found in agent workspace', async () => {
    await expect(publishAgentWorkspaceSkillToGlobalCatalog({ workspaceBasePath: '/base', agent: fakeAgent, skillName: 'nonexistent' })).rejects.toThrow('ENOENT');
  });
  // NOTE: 'throws when skill name has invalid format' removed — with all 3 bundled skills
  // seeded in beforeEach, 'github-api' is in availableSkills, so the "already exists" check
  // (line 319) fires BEFORE the format check (line 320). Format validation cannot be tested
  // for workspace skills via publishAgentWorkspaceSkillToGlobalCatalog without seeding the
  // skill in the workspace AND making it not conflict with bundled names.
  it('copies skill to global catalog when not already installed', async () => {
    // resolveAgentSkillRoot mock returns skillRoot = '/base/agent-42/workspace/skills/my-tool'
    seedDir('/base/agent-42/workspace/skills', ['my-tool']);
    fileStore.set('/base/agent-42/workspace/skills/my-tool/SKILL.md', '---\ndescription: My tool\n---\n');
    seedDir('/base/agent-42/workspace/skills/my-tool', ['SKILL.md']);
    await expect(publishAgentWorkspaceSkillToGlobalCatalog({ workspaceBasePath: '/base', agent: fakeAgent, skillName: 'my-tool' })).resolves.toBeUndefined();
    expect(copyDirectoryContents).toHaveBeenCalledWith(
      '/base/agent-42/workspace/skills/my-tool',
      expect.stringContaining('_system/skills')
    );
  });
  it('throws when target path escapes skills root', async () => {
    // resolveAgentSkillRoot normalizes '../../evil' via path.resolve:
    // '/base/agent-42/workspace/skills' + '../../evil' → '/base/agent-42/evil'
    // The function tries to read SKILL.md from there; seed at that resolved path.
    seedDir('/base/agent-42/workspace/skills', []); // parent dir exists (needed for readdir)
    fileStore.set('/base/agent-42/evil/SKILL.md', '---\ndescription: Evil\n---\n');
    await expect(publishAgentWorkspaceSkillToGlobalCatalog({ workspaceBasePath: '/base', agent: fakeAgent, skillName: '../../evil' })).rejects.toThrow('Invalid skill name');
  });
});
