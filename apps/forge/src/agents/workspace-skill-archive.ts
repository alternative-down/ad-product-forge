import { forgeDebug } from '@forge-runtime/core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

import type { Agent } from '../database/schema';
import { resolveAgentSkillsRoot } from './workspace-skill-paths';

async function ensureDirectory(targetPath: string) {
  try {
    const stat = await fs.stat(targetPath);

    if (stat.isDirectory()) {
      return;
    }

    await fs.rm(targetPath, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      forgeDebug('workspace-skills', `ensureDirectory failed: ${error}`);
      throw error;
    }
  }

  await fs.mkdir(targetPath, { recursive: true });
}

async function ensureParentDirectories(targetPath: string, rootPath: string) {
  const relativePath = path.relative(rootPath, targetPath);
  const segments = relativePath.split(path.sep).slice(0, -1);
  let currentPath = rootPath;

  for (const segment of segments) {
    currentPath = path.resolve(currentPath, segment);
    await ensureDirectory(currentPath);
  }
}

function normalizeArchiveEntryPath(entryPath: string) {
  const normalizedPath = entryPath.replace(/\\/g, '/').replace(/^\/+/, '');
  const isDirectory = normalizedPath.endsWith('/');
  const withoutSkillsPrefix = normalizedPath.startsWith('skills/')
    ? normalizedPath.slice('skills/'.length)
    : normalizedPath;
  const safePath = path.posix.normalize(isDirectory ? withoutSkillsPrefix.slice(0, -1) : withoutSkillsPrefix);

  if (!safePath || safePath === '.' || safePath.startsWith('../') || safePath.includes('/../')) {
    throw new Error(`Invalid skill archive entry: ${entryPath}`);
  }

  return {
    safePath,
    isDirectory,
  };
}

export async function installAgentWorkspaceSkillsArchive(input: {
  workspaceBasePath: string;
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>;
  zipBase64: string;
}) {
  const skillsRoot = resolveAgentSkillsRoot(
    input.workspaceBasePath,
    input.agent.workspaceFilesystem ?? undefined,
    input.agent.id,
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

    const targetPath = path.resolve(skillsRoot, safePath);
    const relativePath = path.relative(skillsRoot, targetPath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
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
    throw new Error('Skill archive did not contain any files');
  }

  return Array.from(writtenSkills).sort((left, right) => left.localeCompare(right));
}
