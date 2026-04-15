import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { Database } from '../database/index';
import { hasToolPermission } from '../capabilities/catalog';
import { publishAgentWorkspaceSkillToGlobalCatalog } from './global-skills';

export function createAgentSkillTools(input: {
  db: Database;
  workspaceBasePath: string;
  agentId: string;
  allowedToolIds?: Set<string> | null;
}) {
  const tools: Record<string, ReturnType<typeof createTool>> = {};

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
          .describe('Skill directory name inside your local `skills/` folder to publish to the shared catalog.'),
      }),
      execute: async ({ context }) => {
        const agent = await input.db.query.agents.findFirst({
          where: (fields, operators) => operators.eq(fields.id, input.agentId),
          columns: {
            id: true,
            workspaceFilesystem: true,
          },
        });

        if (!agent) {
          throw new Error(`Agent not found: ${input.agentId}`);
        }

        await publishAgentWorkspaceSkillToGlobalCatalog({
          workspaceBasePath: input.workspaceBasePath,
          agent,
          skillName: context.skillName,
        });

        return {
          success: true,
          skillName: context.skillName,
        };
      },
    });
  }

  return tools;
}
