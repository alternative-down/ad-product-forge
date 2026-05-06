import { forgeDebug } from '@forge-runtime/core';
import { createTool, type Tool } from '@forge-runtime/core';
import { z } from 'zod';

import { hasToolPermission } from '../capabilities/catalog';
import type { GitHubAppManager } from './manager';

export function createGitHubTools(agentId: string, githubApps: GitHubAppManager, allowedToolIds?: Set<string> | null) {
  const tools: Record<string, Tool<unknown, unknown>> = {};

  if (hasToolPermission(allowedToolIds, 'get_github_git_credentials')) {
    tools.get_github_git_credentials = createTool({
      id: 'get_github_git_credentials',
      description:
        'Get temporary Git credentials for cloning, pulling, or pushing GitHub repositories that this agent can access. These credentials expire within 1 hour, so fetch fresh credentials when needed. You can request credentials for one repository or for all accessible repositories.',
      inputSchema: z.object({
        repositoryName: z
          .string()
          .optional()
          .describe('Optional repository name if you want credentials for one specific repository. Leave empty to get all available credentials.'),
      }),
      execute: async (input) => {
        forgeDebug({ scope: 'tools:github', level: 'info', message: 'get_github_git_credentials called', context: { repositoryName: input.repositoryName } });

        try {
          const result = await githubApps.getGitCredentials({
            agentId,
            repositoryName: input.repositoryName,
          });
          forgeDebug({ scope: 'tools:github', level: 'info', message: 'get_github_git_credentials result', context: { hasCredentials: !!result } });
          return result;
        } catch (error) {
          forgeDebug({ scope: 'tools:github', level: 'info', message: 'get_github_git_credentials error', context: { error: String(error) } });
          return {
            valid: false,
            error: String(error),
            hint: 'Verify GitHub App is installed and has repository access.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_github_provisioning_status')) {
    tools.get_github_provisioning_status = createTool({
      id: 'get_github_provisioning_status',
      description:
        "Check the current provisioning status of this agent's GitHub App. Shows whether the GitHub App has been created and/or installed in the organization. Returns registration/install URLs when needed so the agent can continue the flow.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const provisioning = await githubApps.getAgentProvisioning(agentId);

          if (!provisioning) {
            return {
              valid: true,
              status: 'not_configured',
              message: 'GitHub integration is not configured at the platform level.',
            };
          }

          return {
            valid: true,
            status: provisioning.status,
            registrationUrl: provisioning.registrationUrl,
            installUrl: provisioning.installUrl ?? null,
            message: provisioning.status === 'active'
              ? 'GitHub App is fully provisioned and installed.'
              : provisioning.status === 'created'
              ? 'GitHub App created but not yet installed. Use installUrl to complete installation.'
              : 'GitHub App provisioning is pending. Use registrationUrl to initiate creation.',
          };
        } catch (error) {
          return { valid: false, error: String(error) };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'start_github_app_provisioning')) {
    tools.start_github_app_provisioning = createTool({
      id: 'start_github_app_provisioning',
      description:
        "Start or restart the GitHub App provisioning flow for this agent. Creates a new pending GitHub App manifest record if one doesn't already exist. Returns the registration URL to follow in the browser.",
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const provisioning = await githubApps.getAgentProvisioning(agentId);

          if (provisioning && provisioning.status === 'active') {
            return {
              valid: true,
              status: 'active',
              message: 'GitHub App is already fully provisioned.',
            };
          }

          // getAgentProvisioning auto-creates if not found
          if (!provisioning) {
            return { valid: false, error: 'GitHub integration is not configured at the platform level.' };
          }

          return {
            valid: true,
            status: provisioning.status,
            registrationUrl: provisioning.registrationUrl,
            message: provisioning.status === 'pending'
              ? 'GitHub App manifest submitted. Await GitHub callback to complete creation.'
              : 'Provisioning initiated. Follow registrationUrl to complete GitHub App creation.',
          };
        } catch (error) {
          return { valid: false, error: String(error) };
        }
      },
    });
  }

  return tools;
}