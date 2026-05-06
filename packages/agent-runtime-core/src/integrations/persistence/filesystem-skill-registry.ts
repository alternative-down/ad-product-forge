import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';

import type { SkillDefinition, SkillRegistry } from '../skills/contracts.js';

export type FilesystemSkillRegistryOptions = {
  basePath: string;
};

const skillDefinitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  instructions: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export class FilesystemSkillRegistry implements SkillRegistry {
  private readonly basePath: string;

  constructor(options: FilesystemSkillRegistryOptions) {
    this.basePath = options.basePath;
  }

  async register(skill: SkillDefinition): Promise<void> {
    const normalizedSkill = skillDefinitionSchema.parse(skill);

    await mkdir(this.basePath, { recursive: true });
    await writeFile(
      this.getFilePath(normalizedSkill.id),
      JSON.stringify(normalizedSkill, null, 2),
      'utf8',
    );
  }

  async remove(skillId: string): Promise<void> {
      // eslint-disable-next-line no-dynamic-imports — required for CJS/ESM module bridge
    const { rm } = await import('node:fs/promises');
    await rm(this.getFilePath(skillId), { force: true });
  }

  async get(skillId: string): Promise<SkillDefinition | null> {
    try {
      const raw = await readFile(this.getFilePath(skillId), 'utf8');
      return skillDefinitionSchema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  async list(): Promise<SkillDefinition[]> {
    await mkdir(this.basePath, { recursive: true });
    const entries = await readdir(this.basePath, { withFileTypes: true });
    const skills: SkillDefinition[] = [];

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.skill.json')) {
        continue;
      }

      const skillId = entry.name.slice(0, -'.skill.json'.length);
      const skill = await this.get(skillId);

      if (!skill) {
        continue;
      }

      skills.push(skill);
    }

    return skills.sort((left, right) => left.name.localeCompare(right.name));
  }

  private getFilePath(skillId: string) {
    return join(this.basePath, `${skillId}.skill.json`);
  }
}
