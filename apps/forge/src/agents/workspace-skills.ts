import { errorMsg } from './error-formatting';
import { workspaceSkillArchiveDebug } from './workspace-skill-archive-debug';
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
  // The DB column is text but the runtime contract expects a
  // WorkspaceFilesystemConfig object. agent-loader-runtime-config.ts uses the
  // same `as unknown as` cast pattern when loading the agent, so the runtime
  // value here is the parsed object shape (or null when unset). Cast through
  // unknown to match the resolver's expected type without disabling the
  // surrounding checks.
  const skillsRoot = resolveAgentSkillsRoot(
    workspaceBasePath,
    (agent.workspaceFilesystem ?? undefined) as unknown as Parameters<
      typeof resolveAgentSkillsRoot
    >[1],
    agent.id,
  );


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
            workspaceSkillArchiveDebug('warn', 'Failed to read skill metadata', { error: errorMsg(error), skillName });
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

    workspaceSkillArchiveDebug('error', 'listAgentWorkspaceSkills failed', { error: errorMsg(error) });
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
    workspaceSkillArchiveDebug('warn', 'deleteAgentWorkspaceSkill: invalid skill name', { skillName: input.skillName });
    throw new Error(`Invalid skill name: ${input.skillName}`);
  }

  const { skillsRoot, skillRoot } = resolveAgentSkillRoot({
    workspaceBasePath: input.workspaceBasePath,
    agent: input.agent,
    skillName,
  });
  const relativePath = path.relative(skillsRoot, skillRoot);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    workspaceSkillArchiveDebug('warn', 'deleteAgentWorkspaceSkill: invalid skill name', { skillName: input.skillName });
    throw new Error(`Invalid skill name: ${input.skillName}`);
  }

  await fs.rm(skillRoot, { recursive: true, force: false });
}

