import { forgeDebug } from '@forge-runtime/core';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createTool } from '@forge-runtime/core';
import { z } from 'zod';


import type {Database} from '../database/schema';
import { serializeError } from './agent-runner-error-formatting';
import { hasToolPermission } from '../capabilities/catalog';
import { publishAgentWorkspaceSkillToGlobalCatalog } from './global-skills';
import { resolveAgentSkillRoot } from './workspace-skill-paths';

async function listSkillFiles(skillRoot: string, prefix = ''): Promise<string[]> {
  const entries = await fs.readdir(skillRoot, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = prefix ? path.posix.join(prefix, entry.name) : entry.name;
    const entryPath = path.resolve(skillRoot, entry.name);

    if (entry.isDirectory()) {
      files.push(...await listSkillFiles(entryPath, relativePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function readTextFileIfPossible(filePath: string) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch (error) {
    forgeDebug({ scope: 'skills-tools', level: 'warn', message: 'Failed to read file', context: { error: serializeError(error), filePath } });
    return null;
  }
}

export function createAgentSkillTools(input: {
  db: Database;
  workspaceBasePath: string;
  agentId: string;
  allowedToolIds?: Set<string> | null;
}) {
  const tools: Record<string, ReturnType<typeof createTool>> = {};
  const loadSkillSchema = z.object({
    skillName: z
      .string()
      .trim()
      .min(1)
      .describe('Skill directory name inside `skills/`.'),
  });

  tools.load_workspace_skill = createTool({
    id: 'load_workspace_skill',
    description: 'Load one local workspace skill from `skills/`.',
    inputSchema: loadSkillSchema,
    execute: async (inputData) => {
      const agent = await input.db.query.agents.findFirst({
  
        where: (fields, operators) => operators.eq(fields.id, input.agentId),
        columns: {
          id: true,
          workspaceFilesystem: true,
        },
      });

      if (!agent) {
        forgeDebug({ scope: 'skills-tools', level: 'error', message: 'load_workspace_skill agent not found', context: { agentId: input.agentId } });
        throw new Error(`Agent not found: ${input.agentId}`);
      }

      const { skillsRoot, skillRoot } = resolveAgentSkillRoot({
        workspaceBasePath: input.workspaceBasePath,
        agent,
        skillName: inputData.skillName,
      });
      const relativePath = path.relative(skillsRoot, skillRoot);

      if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        forgeDebug({ scope: 'skills-tools', level: 'error', message: 'load_workspace_skill invalid skill name', context: { skillName: inputData.skillName } });
        throw new Error(`Invalid skill name: ${inputData.skillName}`);
      }

      const skillMarkdownPath = path.resolve(skillRoot, 'SKILL.md');
      const skillMarkdown = await fs.readFile(skillMarkdownPath, 'utf8');
      const files = await listSkillFiles(skillRoot);
      const supportFiles = await Promise.all(
        files
          .filter((filePath) => filePath !== 'SKILL.md')
          .map(async (filePath) => ({
            path: path.posix.join('skills', inputData.skillName, filePath),
            content: await readTextFileIfPossible(path.resolve(skillRoot, filePath)),
          })),
      );

      return {
        skillName: inputData.skillName,
        skillPath: path.posix.join('skills', inputData.skillName),
        skillMarkdownPath: path.posix.join('skills', inputData.skillName, 'SKILL.md'),
        skillMarkdown,
        supportFiles,
      };
    },
  });

  if (hasToolPermission(input.allowedToolIds, 'publish_skill_to_catalog')) {
    tools.publish_skill_to_catalog = createTool({
      id: 'publish_skill_to_catalog',
      description: [
        'Publish one local workspace skill from your `skills/` directory into the shared global skill catalog.',
        'Use this when you intentionally want to promote a reusable local skill so other agents or admin can install it later.',
        'This updates the shared catalog entry for that skill name.',
      ].join(' '),
      inputSchema: z.object({
        skillName: z
          .string()
          .trim()
          .min(1)
          .describe('Skill directory name inside `skills/` to publish.'),
      }),
      execute: async (inputData) => {
        const agent = await input.db.query.agents.findFirst({
  
          where: (fields, operators) => operators.eq(fields.id, input.agentId),
          columns: {
            id: true,
            workspaceFilesystem: true,
          },
        });

        if (!agent) {
          forgeDebug({ scope: 'skills-tools', level: 'error', message: 'load_workspace_skill agent not found', context: { agentId: input.agentId } });
          throw new Error(`Agent not found: ${input.agentId}`);
        }

        await publishAgentWorkspaceSkillToGlobalCatalog({
          workspaceBasePath: input.workspaceBasePath,
          agent,
          skillName: inputData.skillName,
        });

        return {
          success: true,
          skillName: inputData.skillName,
        };
      },
    });
  }

  return tools;
}
