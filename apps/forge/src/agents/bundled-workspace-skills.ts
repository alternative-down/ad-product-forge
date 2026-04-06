import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT_SKILLS_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'skills');
const BUNDLED_SKILL_DIRECTORY_NAMES = ['github-api'] as const;

function parseSkillName(skillContent: string) {
  if (!skillContent.startsWith('---\n')) {
    throw new Error('Bundled skill is missing YAML frontmatter.');
  }

  const endIndex = skillContent.indexOf('\n---\n', 4);

  if (endIndex === -1) {
    throw new Error('Bundled skill frontmatter is not closed.');
  }

  const frontmatter = skillContent.slice(4, endIndex);

  for (const line of frontmatter.split('\n')) {
    const separatorIndex = line.indexOf(':');

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['"]|['"]$/g, '');

    if (key === 'name' && value) {
      return value;
    }
  }

  throw new Error('Bundled skill frontmatter is missing name.');
}

async function copyDirectoryContents(sourceDirectory: string, targetDirectory: string) {
  await fs.mkdir(targetDirectory, { recursive: true });
  const entries = await fs.readdir(sourceDirectory, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.resolve(sourceDirectory, entry.name);
    const targetPath = path.resolve(targetDirectory, entry.name);

    if (entry.isDirectory()) {
      await copyDirectoryContents(sourcePath, targetPath);
      continue;
    }

    await fs.copyFile(sourcePath, targetPath);
  }
}

async function installBundledSkill(agentWorkspaceDirectory: string, sourceDirectoryName: string) {
  const sourceSkillRoot = path.resolve(AGENT_SKILLS_ROOT, sourceDirectoryName);
  const skillFilePath = path.resolve(sourceSkillRoot, 'SKILL.md');
  const skillContent = await fs.readFile(skillFilePath, 'utf8');
  const skillName = parseSkillName(skillContent);

  const targetSkillRoot = path.resolve(agentWorkspaceDirectory, 'skills', skillName);
  await copyDirectoryContents(sourceSkillRoot, targetSkillRoot);
}

export async function ensureBundledWorkspaceSkills(agentWorkspaceDirectory: string) {
  for (const sourceDirectoryName of BUNDLED_SKILL_DIRECTORY_NAMES) {
    await installBundledSkill(agentWorkspaceDirectory, sourceDirectoryName);
  }
}
