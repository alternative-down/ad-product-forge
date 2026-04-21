import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { InMemorySkillRegistry } from '../integrations/skills/in-memory-skill-registry.js';
import { loadSkillsFromDirectory, loadSkillsIntoRegistry } from '../integrations/skills/filesystem-skill-loader.js';

describe('filesystem skill loader', () => {
  it('loads skill definitions from SKILL.md files', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-skill-loader-'));
    const skillDir = join(basePath, 'build-validation');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '# Build Validation',
        '',
        'Run build and validation steps before merge.',
        '',
        'Use this skill when a user asks to validate a project.',
      ].join('\n'),
      'utf8',
    );

    const skills = await loadSkillsFromDirectory({ basePath });

    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({
      id: 'build-validation',
      name: 'Build Validation',
      description: 'Run build and validation steps before merge.',
    });
  });

  it('registers loaded skills into an existing registry', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-skill-loader-'));
    const skillDir = join(basePath, 'workspace-review');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      [
        '# Workspace Review',
        '',
        'Review workspace changes and summarize important issues.',
      ].join('\n'),
      'utf8',
    );

    const registry = new InMemorySkillRegistry();
    await loadSkillsIntoRegistry(registry, { basePath });

    expect(await registry.get('workspace-review')).toMatchObject({
      name: 'Workspace Review',
    });
  });
});
