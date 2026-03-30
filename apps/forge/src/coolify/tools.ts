import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';
import { forgeDebug } from '@mastra-engine/core';

import { hasToolPermission } from '../capabilities/catalog';
import type { CoolifyManager } from './manager';

const coolifyApplicationSlugSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, {
  message: 'slug must be lowercase kebab-case and valid for subdomain use',
});

export function createCoolifyTools(coolify: CoolifyManager, allowedToolIds?: Set<string> | null) {
  const tools: Record<string, unknown> = {};

  if (hasToolPermission(allowedToolIds, 'list_coolify_github_apps')) {
    tools.list_coolify_github_apps = createTool({
      id: 'list_coolify_github_apps',
      description: 'List all GitHub Apps that have been registered and connected to Coolify for deployment automation.',
      inputSchema: z.object({}),
      execute: async () => {
        forgeDebug('tools:coolify', 'list_coolify_github_apps called');
        const result = await coolify.listGitHubApps();
        forgeDebug('tools:coolify', 'list_coolify_github_apps result', { count: result.length });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_github_app_repositories')) {
    tools.list_coolify_github_app_repositories = createTool({
      id: 'list_coolify_github_app_repositories',
      description: 'View all repositories that a specific GitHub App has access to. Useful for identifying which repos can be deployed through Coolify.',
      inputSchema: z.object({
        githubAppId: z.union([z.string().min(1), z.number().int()]).describe('The GitHub App ID or UUID.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'list_coolify_github_app_repositories called', { githubAppId: input.githubAppId });
        const result = await coolify.listGitHubAppRepositories(input);
        forgeDebug('tools:coolify', 'list_coolify_github_app_repositories result', { count: result.length });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_github_app_repository_branches')) {
    tools.list_coolify_github_app_repository_branches = createTool({
      id: 'list_coolify_github_app_repository_branches',
      description: 'View all available branches for a repository. Essential for selecting the correct branch when creating or updating a deployment.',
      inputSchema: z.object({
        githubAppId: z.union([z.string().min(1), z.number().int()]).describe('The GitHub App ID or UUID.'),
        repositoryName: z.string().min(1).describe('The repository name.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'list_coolify_github_app_repository_branches called', { githubAppId: input.githubAppId, repositoryName: input.repositoryName });
        const result = await coolify.listGitHubAppRepositoryBranches(input);
        forgeDebug('tools:coolify', 'list_coolify_github_app_repository_branches result', { count: result.length });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_applications')) {
    tools.list_coolify_applications = createTool({
      id: 'list_coolify_applications',
      description: 'Get an overview of all applications deployed and managed through Coolify, including their current status and deployment state.',
      inputSchema: z.object({}),
      execute: async () => {
        forgeDebug('tools:coolify', 'list_coolify_applications called');
        const result = await coolify.listApplications();
        forgeDebug('tools:coolify', 'list_coolify_applications result', { count: result.length });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application')) {
    tools.get_coolify_application = createTool({
      id: 'get_coolify_application',
      description: 'Retrieve detailed configuration and status information for a specific application, including its linked repository, build settings, and current deployment state.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'get_coolify_application called', { applicationUuid: input.applicationUuid });
        const result = await coolify.getApplication(input.applicationUuid);
        forgeDebug('tools:coolify', 'get_coolify_application result', { found: !!result });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_coolify_application')) {
    tools.manage_coolify_application = createTool({
      id: 'manage_coolify_application',
      description: 'Create new application deployments linked to GitHub repositories, update existing configurations (branch, build commands, environment variables), delete applications, or restart running deployments.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete', 'restart']).describe('The action to perform.'),
        applicationUuid: z.string().min(1).nullish().describe('Application UUID (required for update/delete/restart).'),
        githubAppUuid: z.string().min(1).nullish().describe('GitHub App UUID for repository access.'),
        repositoryOwner: z.string().min(1).nullish().describe('Repository owner (organization or user).'),
        repositoryName: z.string().min(1).nullish().describe('Repository name.'),
        branch: z.string().min(1).nullish().describe('Branch to deploy.'),
        name: z.string().min(1).nullish().describe('Application display name.'),
        slug: coolifyApplicationSlugSchema.nullish().describe('Application slug (kebab-case, used for subdomain).'),
        port: z.number().int().positive().nullish().describe('Application port.'),
        buildCommand: z.string().nullish().describe('Build command.'),
        startCommand: z.string().nullish().describe('Start command.'),
        installCommand: z.string().nullish().describe('Install command.'),
        description: z.string().nullish().describe('Application description.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'manage_coolify_application called', { action: input.action, applicationUuid: input.applicationUuid });
        if (input.action === 'create') {
          const requiredFields = ['githubAppUuid', 'repositoryOwner', 'repositoryName', 'branch', 'name', 'slug', 'port'] as const;
          for (const field of requiredFields) {
            if (input[field] === undefined) {
              forgeDebug('tools:coolify', 'manage_coolify_application validation failed', { reason: `${field} required for create`, action: input.action });
              return { valid: false, error: `${field} is required when action is create` };
            }
          }
        }

        if (input.action !== 'create' && !input.applicationUuid) {
          forgeDebug('tools:coolify', 'manage_coolify_application validation failed', { reason: 'applicationUuid required for non-create', action: input.action });
          return { valid: false, error: 'applicationUuid is required when action is not create' };
        }

        let result;
        if (input.action === 'create') {
          result = await coolify.createApplication({
            githubAppUuid: input.githubAppUuid!,
            repositoryOwner: input.repositoryOwner!,
            repositoryName: input.repositoryName!,
            branch: input.branch!,
            name: input.name!,
            slug: input.slug!,
            port: input.port!,
            buildCommand: input.buildCommand,
            startCommand: input.startCommand,
            installCommand: input.installCommand,
          });
        } else if (input.action === 'delete') {
          result = await coolify.deleteApplication(input.applicationUuid!);
        } else if (input.action === 'restart') {
          result = await coolify.restartApplication(input.applicationUuid!);
        } else {
          result = await coolify.updateApplication({
            applicationUuid: input.applicationUuid!,
            name: input.name,
            description: input.description,
            port: input.port,
            buildCommand: input.buildCommand,
            startCommand: input.startCommand,
            installCommand: input.installCommand,
            branch: input.branch,
            slug: input.slug,
          });
        }
        forgeDebug('tools:coolify', 'manage_coolify_application result', { action: input.action, result });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'toggle_coolify_application')) {
    tools.toggle_coolify_application = createTool({
      id: 'toggle_coolify_application',
      description: 'Immediately start or stop a deployed application. Starting activates the application; stopping deactivates it without removing configuration.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1).describe('The application UUID from Coolify.'),
        state: z.enum(['running', 'stopped']).describe('Target state: running to start, stopped to stop.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'toggle_coolify_application called', { applicationUuid: input.applicationUuid, state: input.state });
        const result = input.state === 'running'
          ? await coolify.startApplication(input.applicationUuid)
          : await coolify.stopApplication(input.applicationUuid);
        forgeDebug('tools:coolify', 'toggle_coolify_application result', { state: input.state, result });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_application_deployments')) {
    tools.list_coolify_application_deployments = createTool({
      id: 'list_coolify_application_deployments',
      description: 'View deployment history for an application including timestamps, status, triggered by information, and deployment UUIDs for log retrieval.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1).describe('The application UUID from Coolify.'),
        limit: z.number().int().positive().max(100).default(20).describe('Maximum number of deployments to return.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'list_coolify_application_deployments called', { applicationUuid: input.applicationUuid, limit: input.limit });
        const result = await coolify.listApplicationDeployments(input);
        forgeDebug('tools:coolify', 'list_coolify_application_deployments result', { count: result.length });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_deployment_logs')) {
    tools.get_coolify_deployment_logs = createTool({
      id: 'get_coolify_deployment_logs',
      description: 'View build and deployment logs for troubleshooting failed deployments. If deploymentUuid is omitted, retrieves logs from the most recent deployment.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1).describe('The application UUID from Coolify.'),
        deploymentUuid: z.string().nullish().describe('Specific deployment UUID (optional, returns latest if omitted).'),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'get_coolify_deployment_logs called', { applicationUuid: input.applicationUuid, deploymentUuid: input.deploymentUuid });
        const result = await coolify.getDeploymentLogs(input);
        forgeDebug('tools:coolify', 'get_coolify_deployment_logs result', { deploymentUuid: result.deploymentUuid, status: result.status });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application_logs')) {
    tools.get_coolify_application_logs = createTool({
      id: 'get_coolify_application_logs',
      description: 'View application runtime logs including application output, errors, and access logs. Useful for monitoring live application behavior.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1).describe('The application UUID from Coolify.'),
        lines: z.number().int().positive().max(5000).nullish().describe('Number of log lines to return (max 5000).'),
        since: z.number().int().positive().nullish().describe('Start from Unix timestamp.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'get_coolify_application_logs called', { applicationUuid: input.applicationUuid, lines: input.lines, since: input.since });
        const result = await coolify.getApplicationLogs(input);
        forgeDebug('tools:coolify', 'get_coolify_application_logs result', { applicationUuid: result.applicationUuid });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application_envs')) {
    tools.get_coolify_application_envs = createTool({
      id: 'get_coolify_application_envs',
      description: 'Retrieve all environment variables configured for an application, including sensitive values and their current settings.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'get_coolify_application_envs called', { applicationUuid: input.applicationUuid });
        const result = await coolify.listApplicationEnvs(input.applicationUuid);
        forgeDebug('tools:coolify', 'get_coolify_application_envs result', { count: result.length });
        return result;
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_coolify_application_env')) {
    tools.manage_coolify_application_env = createTool({
      id: 'manage_coolify_application_env',
      description: 'Add, update, or remove environment variables for an application. Supports literal values, multiline values, and one-time secrets.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']).describe('The action to perform.'),
        applicationUuid: z.string().min(1).describe('The application UUID from Coolify.'),
        key: z.string().min(1).describe('Environment variable key name.'),
        value: z.string().nullish().describe('Environment variable value (required for create/update).'),
        isPreview: z.boolean().nullish().describe('Mark as preview environment variable.'),
        isLiteral: z.boolean().nullish().describe('Treat value as literal (not a secret reference).'),
        isMultiline: z.boolean().nullish().describe('Allow multiline values.'),
        isShownOnce: z.boolean().nullish().describe('Show value only once after creation.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'manage_coolify_application_env called', { action: input.action, applicationUuid: input.applicationUuid, key: input.key });
        if (input.action !== 'delete' && input.value === undefined) {
          forgeDebug('tools:coolify', 'manage_coolify_application_env validation failed', { reason: 'value required for non-delete' });
          return { valid: false, error: 'value is required when action is not delete' };
        }

        let result;
        if (input.action === 'delete') {
          result = await coolify.deleteApplicationEnv({
            applicationUuid: input.applicationUuid,
            key: input.key,
          });
        } else {
          result = await coolify.setApplicationEnv({
            applicationUuid: input.applicationUuid,
            key: input.key,
            value: input.value!,
            isPreview: input.isPreview,
            isLiteral: input.isLiteral,
            isMultiline: input.isMultiline,
            isShownOnce: input.isShownOnce,
          });
        }
        forgeDebug('tools:coolify', 'manage_coolify_application_env result', { action: input.action, key: input.key });
        return result;
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
