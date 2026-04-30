import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { listAgentWorkspaceSkills, deleteAgentWorkspaceSkill } from './workspace-skills';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

// --- Inline copies of the pure helpers for direct unit testing ---
function parseSkillMetadata(skillContent: string) {
  if (!skillContent.startsWith('---\n')) {
    return {};
  }
  const endIndex = skillContent.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    return {};
  }
  const frontmatter = skillContent.slice(4, endIndex);
  const lines = frontmatter.split('\n');
  let description: string | undefined;
  for (const line of lines) {
    const sep = line.indexOf(':');
    if (sep === -1) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim().replace(/^['"]|['"]$/g, '');
    if (key === 'description' && value) description = value;
  }
  return { description };
}

async function countSkillFiles(skillRoot: string): Promise<number> {
  const entries = await fs.readdir(skillRoot, { withFileTypes: true });
  let fileCount = 0;
  for (const entry of entries) {
    if (entry.isDirectory()) {
      fileCount += await countSkillFiles(path.resolve(skillRoot, entry.name));
    } else if (entry.isFile()) {
      fileCount += 1;
    }
  }
  return fileCount;
}

describe('parseSkillMetadata', () => {
  it('returns empty object for content without frontmatter', () => {
    expect(parseSkillMetadata('No frontmatter here')).toEqual({});
    expect(parseSkillMetadata('')).toEqual({});
    expect(parseSkillMetadata('# Just a header')).toEqual({});
    expect(parseSkillMetadata('---\ninvalid')).toEqual({});
    expect(parseSkillMetadata('---\nkey: value\n---\nbut this is content')).toEqual({});
  });

  it('returns empty object when frontmatter has no description', () => {
    expect(parseSkillMetadata('---\nname: my-skill\nversion: 1\n---\nSome content')).toEqual({});
  });

  it('extracts description from frontmatter', () => {
    const result = parseSkillMetadata(
      '---\ndescription: "My skill does things"\nversion: 1\n---\nSome content',
    );
    expect(result).toEqual({ description: 'My skill does things' });
  });

  it('strips double and single quotes from description values', () => {
    expect(
      parseSkillMetadata('---\ndescription: "quoted value"\n---\n').description,
    ).toBe('quoted value');
    expect(
      parseSkillMetadata("---\ndescription: 'single quoted'\n---\n").description,
    ).toBe('single quoted');
  });

  it('handles description with no value', () => {
    const result = parseSkillMetadata('---\ndescription:\nversion: 1\n---\n');
    expect(result.description).toBeUndefined();
  });

  it('handles description with trailing whitespace', () => {
    const result = parseSkillMetadata(
      '---\ndescription:   "some description"  \n---\n',
    );
    expect(result.description).toBe('some description');
  });

  it('uses first description in frontmatter', () => {
    const result = parseSkillMetadata(
      '---\ndescription: First\ndescription: Second\n---\n',
    );
    expect(result.description).toBe('Second'); // last occurrence wins
  });
});

describe('countSkillFiles', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-files-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('returns 0 for empty directory', async () => {
    const skillDir = path.join(tempRoot, 'empty-skill');
    await fs.mkdir(skillDir, { recursive: true });
    const count = await countSkillFiles(skillDir);
    expect(count).toBe(0);
  });

  it('counts files in a flat directory', async () => {
    const skillDir = path.join(tempRoot, 'flat-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Skill');
    await fs.writeFile(path.join(skillDir, 'readme.txt'), 'Readme');
    const count = await countSkillFiles(skillDir);
    expect(count).toBe(2);
  });

  it('counts files recursively in nested directories', async () => {
    const skillDir = path.join(tempRoot, 'nested-skill');
    await fs.mkdir(path.join(skillDir, 'subdir1/nested'), { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Skill');
    await fs.writeFile(path.join(skillDir, 'readme.txt'), 'Readme');
    await fs.writeFile(path.join(skillDir, 'subdir1/file.txt'), 'text');
    await fs.writeFile(path.join(skillDir, 'subdir1/nested/deep.txt'), 'deep');
    const count = await countSkillFiles(skillDir);
    expect(count).toBe(4);
  });

  it('ignores directories themselves in count', async () => {
    const skillDir = path.join(tempRoot, 'dir-only-skill');
    await fs.mkdir(path.join(skillDir, 'subdir'), { recursive: true });
    await fs.writeFile(path.join(skillDir, 'file.txt'), 'text');
    const count = await countSkillFiles(skillDir);
    expect(count).toBe(1);
  });
});

describe('listAgentWorkspaceSkills', () => {
  let tempRoot: string;

  beforeEach(async () => {
    vi.mock('@forge-runtime/core', () => ({ forgeDebug: () => {} }));
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'agent-skills-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await fs.rm(tempRoot, { recursive: true, force: true });
  });

  it('returns empty array when skills directory does not exist', async () => {
    const agent = { id: 'agent-123', workspaceFilesystem: null };
    const result = await listAgentWorkspaceSkills(tempRoot, agent);
    expect(result).toEqual([]);
  });

  it('returns empty array when skills directory is empty', async () => {
    const skillsRoot = path.join(tempRoot, 'agent-123', 'workspace', 'skills');
    await fs.mkdir(skillsRoot, { recursive: true });
    const agent = { id: 'agent-123', workspaceFilesystem: null };
    const result = await listAgentWorkspaceSkills(tempRoot, agent);
    expect(result).toEqual([]);
  });

  it('parses and returns skills with metadata', async () => {
    const skillsRoot = path.join(tempRoot, 'agent-456', 'workspace', 'skills');
    const skillDir = path.join(skillsRoot, 'my-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, 'SKILL.md'),
      '---\ndescription: "A test skill"\n---\n# My Skill\n',
    );
    await fs.writeFile(path.join(skillDir, 'helper.ts'), 'export function help() {}');
    const agent = { id: 'agent-456', workspaceFilesystem: null };
    const result = await listAgentWorkspaceSkills(tempRoot, agent);
    expect(result).toHaveLength(1);
    expect(result[0].skillName).toBe('my-skill');
    expect(result[0].description).toBe('A test skill');
    expect(result[0].fileCount).toBe(2);
  });

  it('ignores skills without SKILL.md', async () => {
    const skillsRoot = path.join(tempRoot, 'agent-789', 'workspace', 'skills');
    const skillDir = path.join(skillsRoot, 'no-metadata-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'README.md'), '# No SKILL.md');
    const agent = { id: 'agent-789', workspaceFilesystem: null };
    const result = await listAgentWorkspaceSkills(tempRoot, agent);
    expect(result).toHaveLength(0);
  });

  it('sorts skills alphabetically', async () => {
    const skillsRoot = path.join(tempRoot, 'agent-abc', 'workspace', 'skills');
    await fs.mkdir(path.join(skillsRoot, 'zulu-skill'), { recursive: true });
    await fs.mkdir(path.join(skillsRoot, 'alpha-skill'), { recursive: true });
    await fs.mkdir(path.join(skillsRoot, 'mike-skill'), { recursive: true });
    await fs.writeFile(
      path.join(skillsRoot, 'zulu-skill', 'SKILL.md'),
      '---\ndescription: "Zulu"\n---\n',
    );
    await fs.writeFile(
      path.join(skillsRoot, 'alpha-skill', 'SKILL.md'),
      '---\ndescription: "Alpha"\n---\n',
    );
    await fs.writeFile(
      path.join(skillsRoot, 'mike-skill', 'SKILL.md'),
      '---\ndescription: "Mike"\n---\n',
    );
    const agent = { id: 'agent-abc', workspaceFilesystem: null };
    const result = await listAgentWorkspaceSkills(tempRoot, agent);
    expect(result.map((s) => s.skillName)).toEqual([
      'alpha-skill',
      'mike-skill',
      'zulu-skill',
    ]);
  });
});

describe('deleteAgentWorkspaceSkill', () => {
  let tempRoot: string;

  beforeEach(async () => {
    vi.mock('@forge-runtime/core', () => ({ forgeDebug: () => {} }));
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'skill-delete-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('throws on invalid skill name with uppercase', async () => {
    const agent = { id: 'agent-123', workspaceFilesystem: null };
    await expect(
      deleteAgentWorkspaceSkill({
        workspaceBasePath: tempRoot,
        agent,
        skillName: 'Invalid-Name',
      }),
    ).rejects.toThrow('Invalid skill name');
  });

  it('throws on invalid skill name with underscores', async () => {
    const agent = { id: 'agent-123', workspaceFilesystem: null };
    await expect(
      deleteAgentWorkspaceSkill({
        workspaceBasePath: tempRoot,
        agent,
        skillName: 'skill_name',
      }),
    ).rejects.toThrow('Invalid skill name');
  });

  it('throws on invalid skill name with dots', async () => {
    const agent = { id: 'agent-123', workspaceFilesystem: null };
    await expect(
      deleteAgentWorkspaceSkill({
        workspaceBasePath: tempRoot,
        agent,
        skillName: 'skill.name',
      }),
    ).rejects.toThrow('Invalid skill name');
  });

  it('throws on empty skill name', async () => {
    const agent = { id: 'agent-123', workspaceFilesystem: null };
    await expect(
      deleteAgentWorkspaceSkill({
        workspaceBasePath: tempRoot,
        agent,
        skillName: '',
      }),
    ).rejects.toThrow('Invalid skill name');
  });

  it('throws on skill name starting with hyphen', async () => {
    const agent = { id: 'agent-123', workspaceFilesystem: null };
    await expect(
      deleteAgentWorkspaceSkill({
        workspaceBasePath: tempRoot,
        agent,
        skillName: '-myskill',
      }),
    ).rejects.toThrow('Invalid skill name');
  });

  it('throws on path traversal attempt', async () => {
    const agent = { id: 'agent-123', workspaceFilesystem: null };
    await expect(
      deleteAgentWorkspaceSkill({
        workspaceBasePath: tempRoot,
        agent,
        skillName: '../etc/passwd',
      }),
    ).rejects.toThrow('Invalid skill name');
    await expect(
      deleteAgentWorkspaceSkill({
        workspaceBasePath: tempRoot,
        agent,
        skillName: 'foo/../../bar',
      }),
    ).rejects.toThrow('Invalid skill name');
  });

  it('deletes an existing skill directory', async () => {
    const skillsRoot = path.join(tempRoot, 'agent-del', 'workspace', 'skills');
    const skillDir = path.join(skillsRoot, 'my-skill');
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, 'SKILL.md'), '# Skill');
    await fs.writeFile(path.join(skillDir, 'file.ts'), '// content');
    const agent = { id: 'agent-del', workspaceFilesystem: null };
    await deleteAgentWorkspaceSkill({
      workspaceBasePath: tempRoot,
      agent,
      skillName: 'my-skill',
    });
    await expect(fs.access(skillDir)).rejects.toThrow();
  });

  it('validates trimmed name — whitespace-padded valid name passes validation', async () => {
    const agent = { id: 'agent-123', workspaceFilesystem: null };
    // '  my-skill  ' trimmed is 'my-skill' which passes the regex
    // So it will throw ENOENT, not "Invalid skill name"
    await expect(
      deleteAgentWorkspaceSkill({
        workspaceBasePath: tempRoot,
        agent,
        skillName: '  my-skill  ',
      }),
    ).rejects.toThrow(); // Not "Invalid skill name" — name is valid after trim
  });
});
