import { workspaceSkillArchiveDebug } from './workspace-skill-archive-debug';

import {
  WorkspaceSkillArchiveEmptyArchiveError,
  WorkspaceSkillArchiveInvalidEntryError,
} from './workspace-skill-archive.errors';
import fs from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

import { WorkspaceFilesystemConfigSchema } from '../database/schema';
import type { Agent } from '../database/schema';
import { resolveAgentSkillsRoot } from './workspace-skill-paths';
import { parseWorkspaceJsonConfig } from './agent-loader-runtime-config';
import {
  ensureDirectory,
  ensureParentDirectories,
  normalizeArchiveEntryPath,
} from './workspace-skill-helpers';

export async function installAgentWorkspaceSkillsArchive(input: {
  workspaceBasePath: string;
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>;
  zipBase64: string;
}) {
  const skillsRoot = resolveAgentSkillsRoot(
    input.workspaceBasePath,
    parseWorkspaceJsonConfig(input.agent.workspaceFilesystem, WorkspaceFilesystemConfigSchema),
    input.agent.id,
  );

  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(Buffer.from(input.zipBase64, 'base64'));
  } catch (error) {
    workspaceSkillArchiveDebug('error', `unzipSync failed: ${error}`);
    throw error;
  }

  try {
    await fs.mkdir(skillsRoot, { recursive: true });
  } catch (error) {
    workspaceSkillArchiveDebug('error', `mkdir skillsRoot failed: ${error}`);
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
      workspaceSkillArchiveDebug('warn', `Blocked path escape in archive entry: ${entryPath}`);
      throw new WorkspaceSkillArchiveInvalidEntryError(entryPath);
    }

    try {
      if (isDirectory) {
        await ensureDirectory(targetPath);
        continue;
      }

      await ensureParentDirectories(targetPath, skillsRoot);
      await fs.writeFile(targetPath, Buffer.from(content));
    } catch (error) {
      workspaceSkillArchiveDebug('error', `Failed to write archive entry: ${error}`);
      throw error;
    }

    writtenSkills.add(skillName);
  }

  if (writtenSkills.size === 0) {
    workspaceSkillArchiveDebug('warn', 'Skill archive did not contain any files');
    throw new WorkspaceSkillArchiveEmptyArchiveError();
  }

  return Array.from(writtenSkills).sort((left, right) => left.localeCompare(right));
}
