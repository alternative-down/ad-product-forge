import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { FilesystemSkillRegistry } from '../integrations/persistence/filesystem-skill-registry.js';

describe('filesystem skill registry', () => {
  it('persists and reloads skills from disk', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-skills-'));
    const registry = new FilesystemSkillRegistry({ basePath });

    await registry.register({
      id: 'build-validation',
      name: 'Build Validation',
      description: 'Run build and validation commands before merge.',
      instructions: 'Run npm test, npm run build, then summarize failures.',
      metadata: {
        scope: 'workspace',
      },
    });

    const reloadedRegistry = new FilesystemSkillRegistry({ basePath });
    const skill = await reloadedRegistry.get('build-validation');
    const listed = await reloadedRegistry.list();
    const rawFile = await readFile(join(basePath, 'build-validation.skill.json'), 'utf8');

    expect(skill?.name).toBe('Build Validation');
    expect(listed).toHaveLength(1);
    expect(JSON.parse(rawFile)).toMatchObject({
      id: 'build-validation',
      name: 'Build Validation',
    });
  });

  it('ignores malformed skill files during listing', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-skills-'));
    const registry = new FilesystemSkillRegistry({ basePath });

    await registry.register({
      id: 'valid-skill',
      name: 'Valid Skill',
      description: 'A valid stored skill.',
      instructions: 'Do the thing clearly.',
    });

    await writeFile(join(basePath, 'broken.skill.json'), '{"id":""}', 'utf8');

    const listed = await registry.list();

    expect(listed).toHaveLength(1);
    expect(listed[0]?.id).toBe('valid-skill');
  });

  it('removes persisted skills from disk', async () => {
    const basePath = await mkdtemp(join(tmpdir(), 'agent-runtime-core-skills-'));
    const registry = new FilesystemSkillRegistry({ basePath });

    await registry.register({
      id: 'build-validation',
      name: 'Build Validation',
      description: 'Run build and validation commands before merge.',
      instructions: 'Run npm test, npm run build, then summarize failures.',
    });

    await registry.remove('build-validation');

    expect(await registry.get('build-validation')).toBeNull();
    expect(await registry.list()).toEqual([]);
  });
});
