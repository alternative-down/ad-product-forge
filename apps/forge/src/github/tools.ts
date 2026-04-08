import { forgeDebug } from '@mastra-engine/core';
import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';
import type { GitHubAppManager } from './manager';

export function createGitHubTools(agentId: string, githubApps: GitHubAppManager, allowedToolIds?: Set<string> | null) {
  const tools: Record<string, Tool<unknown, unknown>> = {};

  if (hasToolPermission(allowedToolIds, 'get_github_git_credentials')) {
    tools.get_github_git_credentials = createTool({
      id: 'get_github_git_credentials',
      description:
        'Get temporary Git credentials for cloning, pulling, or pushing GitHub repositories that this agent can access. You can request credentials for one repository or for all accessible repositories.',
      inputSchema: z.object({
        repositoryName: z
          .string()
          .optional()
          .describe('Optional repository name if you want credentials for one specific repository. Leave empty to get all available credentials.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:github', 'get_github_git_credentials called', { repositoryName: input.repositoryName });

        try {
          const result = await githubApps.getGitCredentials({
            agentId,
            repositoryName: input.repositoryName,
          });
          forgeDebug('tools:github', 'get_github_git_credentials result', { hasCredentials: !!result });
          return result;
        } catch (error) {
          forgeDebug('tools:github', 'get_github_git_credentials error', { error: String(error) });
          return {
            valid: false,
            error: String(error),
            hint: 'Verify GitHub App is installed and has repository access.',
          };
        }
      },
    });
  }

  return tools;
}
