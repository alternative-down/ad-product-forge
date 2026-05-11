import { forgeDebug } from '@forge-runtime/core';
import fs from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

import type { Agent } from '../database/schema';
import { resolveAgentSkillsRoot } from './workspace-skill-paths';
import { ensureDirectory, ensureParentDirectories, normalizeArchiveEntryPath } from './workspace-skill-helpers';

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

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(Buffer.from(input.zipBase64, 'base64'));
  } catch (error) {
    forgeDebug({ scope: 'workspace-skills', level: 'error', message: `unzipSync failed: ${error}` });
    throw error;
  }

  try {
    await fs.mkdir(skillsRoot, { recursive: true });
  } catch (error) {
    forgeDebug({ scope: 'workspace-skills', level: 'error', message: `mkdir skillsRoot failed: ${error}`, context: { skillsRoot } });
    throw error;
  }

  const writtenSkills = new Set<string>();

  for (const [entryPath, content] of Object.entries(archive)) {
    const { safePath, isDirectory } = normalizeArchiveEntryPath(entryPath);
    const [skillName] = safePath.split('/');

    if (!skillName) {
      continue;
    }

    const targetPath = path.resolve(skillsRoot, safePath);
    const relativePath = path.relative(skillsRoot, targetPath);

    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      forgeDebug({ scope: 'workspace-skills', level: 'warn', message: `Blocked path escape in archive entry: ${entryPath}` });
      throw new Error(`Invalid skill archive entry: ${entryPath}`);
    }

    try {
      if (isDirectory) {
        await ensureDirectory(targetPath);
        continue;
      }

      await ensureParentDirectories(targetPath, skillsRoot);
      await fs.writeFile(targetPath, Buffer.from(content));
    } catch (error) {
      forgeDebug({ scope: 'workspace-skills', level: 'error', message: `Failed to write archive entry: ${error}`, context: { entryPath, targetPath } });
      throw error;
    }

    writtenSkills.add(skillName);
  }

  if (writtenSkills.size === 0) {
    forgeDebug({ scope: 'workspace-skills', level: 'warn', message: 'Skill archive did not contain any files' });
    throw new Error('Skill archive did not contain any files');
  }

  return Array.from(writtenSkills).sort((left, right) => left.localeCompare(right));
}