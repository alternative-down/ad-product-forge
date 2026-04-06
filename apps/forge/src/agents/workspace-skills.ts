import fs from 'node:fs/promises';
import path from 'node:path';
import { unzipSync } from 'fflate';

import type { Agent, WorkspaceFilesystemConfig } from '../database/schema';

type AgentSkillSummary = {
  skillName: string;
  description?: string;
  fileCount: number;
  updatedAt: number;
};

function resolveAgentWorkspaceRoot(
  workspaceBasePath: string,
  workspaceFilesystem: WorkspaceFilesystemConfig | null | undefined,
  agentId: string,
) {
  const agentWorkspacePath = path.resolve(workspaceBasePath, agentId);

  return workspaceFilesystem?.basePath
    ? path.resolve(agentWorkspacePath, workspaceFilesystem.basePath)
    : path.resolve(agentWorkspacePath, 'workspace');
}

function resolveAgentSkillsRoot(
  workspaceBasePath: string,
  workspaceFilesystem: WorkspaceFilesystemConfig | null | undefined,
  agentId: string,
) {
  return path.resolve(resolveAgentWorkspaceRoot(workspaceBasePath, workspaceFilesystem, agentId), 'skills');
}

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

async function ensureDirectory(targetPath: string) {
  try {
    const stat = await fs.stat(targetPath);

    if (stat.isDirectory()) {
      return;
    }

    await fs.rm(targetPath, { force: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
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

export async function deleteAgentWorkspaceSkill(input: {
  workspaceBasePath: string;
  agent: Pick<Agent, 'id' | 'workspaceFilesystem'>;
  skillName: string;
}) {
  const skillName = input.skillName.trim();

  if (!/^[a-z0-9][a-z0-9-]*$/.test(skillName)) {
    throw new Error(`Invalid skill name: ${input.skillName}`);
  }

  const skillsRoot = resolveAgentSkillsRoot(
    input.workspaceBasePath,
    input.agent.workspaceFilesystem ?? undefined,
    input.agent.id,
  );
  const skillRoot = path.resolve(skillsRoot, skillName);
  const relativePath = path.relative(skillsRoot, skillRoot);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid skill name: ${input.skillName}`);
  }

  await fs.rm(skillRoot, { recursive: true, force: false });
}
