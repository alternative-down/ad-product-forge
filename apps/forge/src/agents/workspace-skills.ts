import fs from 'node:fs/promises';
import path from 'node:path';

import type { Agent } from '../database/schema';
import { installAgentWorkspaceSkillsArchive } from './workspace-skill-archive';
import { resolveAgentSkillRoot, resolveAgentSkillsRoot } from './workspace-skill-paths';

type AgentSkillSummary = {
  skillName: string;
  description?: string;
  fileCount: number;
  updatedAt: number;
};

function parseSkillMetadata(skillContent: string) {
  if (!skillContent.startsWith('---\n')) {
    return {};
  }

  const endIndex = skillContent.indexOf('\n---\n', 4);

  if (endIndex === -1) {
    return {};
  }

  const frontmatter = skillContent.slice(4, endIndex);
  const lines = frontmatter.split('\n');
  let description: string | undefined;

  for (const line of lines) {
    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');

    if (key === 'description' && value) {
      description = value;
    }
  }

  return { description };
}

async function countSkillFiles(skillRoot: string): Promise<number> {
  const entries = await fs.readdir(skillRoot, { withFileTypes: true });
  let fileCount = 0;

  for (const entry of entries) {
    const entryPath = path.resolve(skillRoot, entry.name);

    if (entry.isDirectory()) {
      fileCount += await countSkillFiles(entryPath);
      continue;
    }

    if (entry.isFile()) {
      fileCount += 1;
    }
  }

  return fileCount;
}

export async function listAgentWorkspaceSkills(
  workspaceBasePath: string,
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>,
): Promise<AgentSkillSummary[]> {
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
          } catch {
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

    throw error;
  }
}

export async function installAgentWorkspaceSkillsFromZip(input: {
  workspaceBasePath: string;
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>;
  zipBase64: string;
}) {
  return installAgentWorkspaceSkillsArchive(input);
}

export async function deleteAgentWorkspaceSkill(input: {
  workspaceBasePath: string;
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>;
  skillName: string;
}) {
  const skillName = input.skillName.trim();

  if (!/^[a-z0-9][a-z0-9-]*$/.test(skillName)) {
    throw new Error(`Invalid skill name: ${input.skillName}`);
  }

  const { skillsRoot, skillRoot } = resolveAgentSkillRoot({
    workspaceBasePath: input.workspaceBasePath,
    agent: input.agent,
    skillName,
  });
  const relativePath = path.relative(skillsRoot, skillRoot);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid skill name: ${input.skillName}`);
  }

  await fs.rm(skillRoot, { recursive: true, force: false });
}
