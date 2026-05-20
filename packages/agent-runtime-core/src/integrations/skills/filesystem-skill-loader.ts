import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import type { SkillDefinition, SkillRegistry } from './contracts.js';

export type FilesystemSkillLoaderOptions = {
  basePath: string;
};

const headingSchema = z.string().min(1);

export async function loadSkillsFromDirectory(
  options: FilesystemSkillLoaderOptions,
): Promise<SkillDefinition[]> {
  const skillFiles = await findSkillFiles(options.basePath);
  const skills: SkillDefinition[] = [];

  for (const skillFile of skillFiles) {
    const skill = await readSkillDefinition(skillFile);

    if (!skill) {
      continue;
    }

    skills.push(skill);
  }

  return skills.sort((left, right) => left.name.localeCompare(right.name));
}

export async function loadSkillsIntoRegistry(
  registry: SkillRegistry,
  options: FilesystemSkillLoaderOptions,
): Promise<SkillDefinition[]> {
  const skills = await loadSkillsFromDirectory(options);

  for (const skill of skills) {
    await registry.register(skill);
  }

  return skills;
}

async function findSkillFiles(basePath: string): Promise<string[]> {
  const entries = await readdir(basePath, { withFileTypes: true }).catch(() => []);
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(basePath, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await findSkillFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && entry.name === 'SKILL.md') {
      files.push(absolutePath);
    }
  }

  return files;
}

async function readSkillDefinition(skillFilePath: string): Promise<SkillDefinition | null> {
  const raw = await readFile(skillFilePath, 'utf8').catch(() => null);

  if (!raw) {
    return null;
  }

  const normalized = raw.replace(/\r\n/g, '\n').trim();

  if (!normalized) {
    return null;
  }

  const lines = normalized.split('\n');
  const firstHeadingLine = lines.find((line) => line.startsWith('# '));
  const heading = headingSchema.safeParse(firstHeadingLine?.slice(2).trim());

  if (!heading.success) {
    return null;
  }

  const firstParagraph = extractFirstParagraph(lines);
  const skillDirectory = skillFilePath.slice(0, skillFilePath.length - '/SKILL.md'.length);
  const skillId = skillDirectory.split('/').filter(Boolean).at(-1);

  if (!skillId) {
    return null;
  }

  return {
    id: skillId,
    name: heading.data,
    description: firstParagraph ?? heading.data,
    instructions: normalized,
    metadata: {
      source: 'filesystem-skill-loader',
      skillFilePath,
    },
  };
}

function extractFirstParagraph(lines: string[]) {
  const contentLines = lines.filter((line) => !line.startsWith('# '));
  const paragraphs = contentLines
    .join('\n')
    .split('\n\n')
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return paragraphs[0] ?? null;
}
