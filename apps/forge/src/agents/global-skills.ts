import fs from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';
import { forgeDebug } from '@forge-runtime/core';
import {
  ensureDirectory,
  ensureParentDirectories,
  normalizeArchiveEntryPath,
} from './workspace-skill-helpers';

import type { Agent } from '../database/schema';
export {
  installAgentWorkspaceSkillsFromZip,
  deleteAgentWorkspaceSkill,
  listAgentWorkspaceSkills,
} from './workspace-skills';
import {
  BUNDLED_SKILL_DIRECTORY_NAMES,
  copyDirectoryContents,
  resolveBundledSkillRoot,
} from './bundled-workspace-skills';
import { resolveAgentSkillRoot, resolveAgentSkillsRoot } from './workspace-skill-paths';
import {
  parseSkillMetadata as _parseSkillMetadata,
  countSkillFiles as _countSkillFiles,
} from './skills-shared/index';
const parseSkillMetadata = _parseSkillMetadata;
const countSkillFiles = _countSkillFiles;

type GlobalSkillSummary = {
  skillName: string;
  description?: string;
  fileCount: number;
  updatedAt: number;
  source: 'bundled' | 'custom';
  editable: boolean;
};

function resolveGlobalSkillsRoot(workspaceBasePath: string) {
  return path.resolve(workspaceBasePath, '_system', 'skills');
}

async function listCustomGlobalSkills(workspaceBasePath: string): Promise<GlobalSkillSummary[]> {
  const skillsRoot = resolveGlobalSkillsRoot(workspaceBasePath);

  try {
    const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
    const skills = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const skillRoot = path.resolve(skillsRoot, entry.name);
          const skillFilePath = path.resolve(skillRoot, 'SKILL.md');
          const [skillContent, stat, fileCount] = await Promise.all([
            fs.readFile(skillFilePath, 'utf8'),
            fs.stat(skillFilePath),
            countSkillFiles(skillRoot),
          ]);
          const metadata = parseSkillMetadata(skillContent);

          return {
            skillName: entry.name,
            description: metadata.description,
            fileCount,
            updatedAt: stat.mtimeMs,
            source: 'custom' as const,
            editable: true,
          };
        }),
    );

    return skills.sort((left, right) => left.skillName.localeCompare(right.skillName));
  } catch (error) {
    forgeDebug({
      scope: 'global-skills',
      level: 'error',
      message: 'loadCustomSkills failed',
      context: { error: error instanceof Error ? error.message : String(error) },
    });
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}

async function listBundledGlobalSkills(): Promise<GlobalSkillSummary[]> {
  const skills = await Promise.all(
    BUNDLED_SKILL_DIRECTORY_NAMES.map(async (sourceDirectoryName) => {
      const skillRoot = await resolveBundledSkillRoot(sourceDirectoryName);
      const skillFilePath = path.resolve(skillRoot, 'SKILL.md');
      const [skillContent, stat, fileCount] = await Promise.all([
        fs.readFile(skillFilePath, 'utf8'),
        fs.stat(skillFilePath),
        countSkillFiles(skillRoot),
      ]);
      const metadata = parseSkillMetadata(skillContent);

      return {
        skillName: sourceDirectoryName,
        description: metadata.description,
        fileCount,
        updatedAt: stat.mtimeMs,
        source: 'bundled' as const,
        editable: false,
      };
    }),
  );

  return skills.sort((left, right) => left.skillName.localeCompare(right.skillName));
}

export async function listGlobalSkills(workspaceBasePath: string): Promise<GlobalSkillSummary[]> {
  const [bundledSkills, customSkills] = await Promise.all([
    listBundledGlobalSkills(),
    listCustomGlobalSkills(workspaceBasePath),
  ]);
  const bySkillName = new Map<string, GlobalSkillSummary>();

  for (const bundledSkill of bundledSkills) {
    bySkillName.set(bundledSkill.skillName, bundledSkill);
  }

  for (const customSkill of customSkills) {
    bySkillName.set(customSkill.skillName, customSkill);
  }

  return Array.from(bySkillName.values()).sort((left, right) =>
    left.skillName.localeCompare(right.skillName),
  );
}

export async function installGlobalSkillsFromZip(input: {
  workspaceBasePath: string;
  zipBase64: string;
}) {
  const skillsRoot = resolveGlobalSkillsRoot(input.workspaceBasePath);
  const bundledSkillNames = new Set(
    (await listBundledGlobalSkills()).map((skill) => skill.skillName),
  );
  const archive = unzipSync(Buffer.from(input.zipBase64, 'base64'));
  const writtenSkills = new Set<string>();

  await fs.mkdir(skillsRoot, { recursive: true });

  for (const [entryPath, content] of Object.entries(archive)) {
    const { safePath, isDirectory } = normalizeArchiveEntryPath(entryPath);
    const [skillName] = safePath.split('/');

    if (!skillName) {
      continue;
    }

    if (bundledSkillNames.has(skillName)) {
      forgeDebug({
        scope: 'global-skills',
        level: 'warn',
        message: 'loadGlobalSkill: name reserved by bundled skill',
        context: { skillName },
      });
      throw new Error(`Skill name is reserved by a bundled skill: ${skillName}`);
    }

    const targetPath = path.resolve(skillsRoot, safePath);
    const relativePath = path.relative(skillsRoot, targetPath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      forgeDebug({
        scope: 'global-skills',
        level: 'warn',
        message: 'loadGlobalSkill: invalid archive entry',
        context: { entryPath },
      });
      throw new Error(`Invalid skill archive entry: ${entryPath}`);
    }

    if (isDirectory) {
      await ensureDirectory(targetPath);
      continue;
    }

    await ensureParentDirectories(targetPath, skillsRoot);
    await fs.writeFile(targetPath, Buffer.from(content));
    writtenSkills.add(skillName);
  }

  if (writtenSkills.size === 0) {
    forgeDebug({
      scope: 'global-skills',
      level: 'warn',
      message: 'loadGlobalSkill: archive empty',
    });
    throw new Error('Skill archive did not contain any files');
  }

  return Array.from(writtenSkills).sort((left, right) => left.localeCompare(right));
}

export async function deleteGlobalSkill(input: { workspaceBasePath: string; skillName: string }) {
  const skillName = input.skillName.trim();
  const skillsRoot = resolveGlobalSkillsRoot(input.workspaceBasePath);
  const skillRoot = path.resolve(skillsRoot, skillName);
  const relativePath = path.relative(skillsRoot, skillRoot);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid skill name: ${input.skillName}`);
  }

  await fs.rm(skillRoot, { recursive: true, force: false });
}

export async function installGlobalSkillToAgentWorkspace(input: {
  workspaceBasePath: string;
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>;
  skillName: string;
}) {
  const availableSkills = await listGlobalSkills(input.workspaceBasePath);
  const skill = availableSkills.find((entry) => entry.skillName === input.skillName);

  if (!skill) {
    throw new Error(`Global skill not found: ${input.skillName}`);
  }

  const sourceRoot =
    skill.source === 'bundled'
      ? await resolveBundledSkillRoot(input.skillName)
      : path.resolve(resolveGlobalSkillsRoot(input.workspaceBasePath), input.skillName);
  const { skillRoot } = resolveAgentSkillRoot({
    workspaceBasePath: input.workspaceBasePath,
    agent: input.agent,
    skillName: input.skillName,
  });
  const targetSkillsRoot = resolveAgentSkillsRoot(
    input.workspaceBasePath,
    (input.agent.workspaceFilesystem as any) ?? undefined,
    input.agent.id,
  );

  await fs.mkdir(targetSkillsRoot, { recursive: true });
  await fs.rm(skillRoot, { recursive: true, force: true });
  await copyDirectoryContents(sourceRoot, skillRoot);
}

export async function publishAgentWorkspaceSkillToGlobalCatalog(input: {
  workspaceBasePath: string;
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>;
  skillName: string;
}) {
  const skillName = input.skillName.trim();

  if (!/^[a-z0-9][a-z0-9-]*$/.test(skillName)) {
    throw new Error(`Invalid skill name: ${input.skillName}`);
  }

  const bundledSkillNames = new Set(
    (await listBundledGlobalSkills()).map((skill) => skill.skillName),
  );

  if (bundledSkillNames.has(skillName)) {
    throw new Error(`Skill name is reserved by a bundled skill: ${skillName}`);
  }

  const { skillRoot: sourceRoot } = resolveAgentSkillRoot({
    workspaceBasePath: input.workspaceBasePath,
    agent: input.agent,
    skillName,
  });
  const targetRoot = path.resolve(resolveGlobalSkillsRoot(input.workspaceBasePath), skillName);
  const targetSkillsRoot = resolveGlobalSkillsRoot(input.workspaceBasePath);
  const relativePath = path.relative(targetSkillsRoot, targetRoot);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid skill name: ${input.skillName}`);
  }

  await fs.access(path.resolve(sourceRoot, 'SKILL.md'));
  await fs.mkdir(targetSkillsRoot, { recursive: true });
  await fs.rm(targetRoot, { recursive: true, force: true });
  await copyDirectoryContents(sourceRoot, targetRoot);
}
