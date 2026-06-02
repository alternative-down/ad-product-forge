import { errorMsg } from './error-formatting';
import { forgeDebug } from '@forge-runtime/core';
import fs from 'node:fs/promises';
import path from 'node:path';

import type { Agent } from '../database/schema';
import { installAgentWorkspaceSkillsArchive } from './workspace-skill-archive';
import { resolveAgentSkillRoot, resolveAgentSkillsRoot } from './workspace-skill-paths';
import { parseSkillMetadata, countSkillFiles } from './skills-shared/index';

type AgentSkillSummary = {
  skillName: string;
  description?: string;
  fileCount: number;
  updatedAt: number;
};

export async function listAgentWorkspaceSkills(
  workspaceBasePath: string,
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>,
): Promise<AgentSkillSummary[]> {
  // @ts-expect-error workspaceFilesystem type may not match WorkspaceFilesystemConfig
  const skillsRoot = resolveAgentSkillsRoot(workspaceBasePath, agent.workspaceFilesystem ?? undefined, agent.id);

  try {
    const entries = await fs.readdir(skillsRoot, { withFileTypes: true });
    const skills = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const skillName = entry.name;
          const skillRoot = path.resolve(skillsRoot, skillName);
          const skillFilePath = path.resolve(skillRoot, 'SKILL.md');

          try {
            const [skillContent, stat, fileCount] = await Promise.all([
              fs.readFile(skillFilePath, 'utf8'),
              fs.stat(skillFilePath),
              countSkillFiles(skillRoot),
            ]);
            const metadata = parseSkillMetadata(skillContent);

            return {
              skillName,
              description: metadata.description,
              fileCount,
              updatedAt: stat.mtimeMs,
            };
          } catch (error) {
            forgeDebug({
              scope: 'workspace-skills',
              level: 'warn',
              message: 'Failed to read skill metadata',
              context: { error: errorMsg(error), skillName },
            });
            return null;
          }
        }),
    );
    const installedSkills: AgentSkillSummary[] = [];

    for (const skill of skills) {
      if (!skill) {
        continue;
      }

      installedSkills.push(skill);
    }

    return installedSkills.sort((left, right) => left.skillName.localeCompare(right.skillName));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }

    forgeDebug({
      scope: 'workspace-skills',
      level: 'error',
      message: 'listAgentWorkspaceSkills failed',
      context: { error: errorMsg(error) },
    });
    throw error;
  }
}

export async function installAgentWorkspaceSkillsFromZip(input: {
  workspaceBasePath: string;
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>;
  zipBase64: string;
}) {
  return await installAgentWorkspaceSkillsArchive(input);
}

export async function deleteAgentWorkspaceSkill(input: {
  workspaceBasePath: string;
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>;
  skillName: string;
}) {
  const skillName = input.skillName.trim();

  if (!/^[a-z0-9][a-z0-9-]*$/.test(skillName)) {
    forgeDebug({
      scope: 'workspace-skills',
      level: 'warn',
      message: 'deleteAgentWorkspaceSkill: invalid skill name',
      context: { skillName: input.skillName },
    });
    throw new Error(`Invalid skill name: ${input.skillName}`);
  }

  const { skillsRoot, skillRoot } = resolveAgentSkillRoot({
    workspaceBasePath: input.workspaceBasePath,
    agent: input.agent,
    skillName,
  });
  const relativePath = path.relative(skillsRoot, skillRoot);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    forgeDebug({
      scope: 'workspace-skills',
      level: 'warn',
      message: 'deleteAgentWorkspaceSkill: invalid skill name',
      context: { skillName: input.skillName },
    });
    throw new Error(`Invalid skill name: ${input.skillName}`);
  }

  await fs.rm(skillRoot, { recursive: true, force: false });
}
