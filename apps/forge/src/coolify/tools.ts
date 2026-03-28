import { createTool, type Tool } from '@mastra/core/tools';
import { z } from 'zod';

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
      execute: async () => coolify.listGitHubApps(),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_github_app_repositories')) {
    tools.list_coolify_github_app_repositories = createTool({
      id: 'list_coolify_github_app_repositories',
      description: 'View all repositories that a specific GitHub App has access to. Useful for identifying which repos can be deployed through Coolify.',
      inputSchema: z.object({
        githubAppId: z.union([z.string().min(1), z.number().int()]),
      }),
      execute: async (input) => coolify.listGitHubAppRepositories(input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_github_app_repository_branches')) {
    tools.list_coolify_github_app_repository_branches = createTool({
      id: 'list_coolify_github_app_repository_branches',
      description: 'View all available branches for a repository. Essential for selecting the correct branch when creating or updating a deployment.',
      inputSchema: z.object({
        githubAppId: z.union([z.string().min(1), z.number().int()]),
        repositoryName: z.string().min(1),
      }),
      execute: async (input) => coolify.listGitHubAppRepositoryBranches(input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_applications')) {
    tools.list_coolify_applications = createTool({
      id: 'list_coolify_applications',
      description: 'Get an overview of all applications deployed and managed through Coolify, including their current status and deployment state.',
      inputSchema: z.object({}),
      execute: async () => coolify.listApplications(),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application')) {
    tools.get_coolify_application = createTool({
      id: 'get_coolify_application',
      description: 'Retrieve detailed configuration and status information for a specific application, including its linked repository, build settings, and current deployment state.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => coolify.getApplication(input.applicationUuid),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_coolify_application')) {
    tools.manage_coolify_application = createTool({
      id: 'manage_coolify_application',
      description: 'Create new application deployments linked to GitHub repositories, update existing configurations (branch, build commands, environment variables), delete applications, or restart running deployments.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete', 'restart']),
        applicationUuid: z.string().min(1).nullish(),
        githubAppUuid: z.string().min(1).nullish(),
        repositoryOwner: z.string().min(1).nullish(),
        repositoryName: z.string().min(1).nullish(),
        branch: z.string().min(1).nullish(),
        name: z.string().min(1).nullish(),
        slug: coolifyApplicationSlugSchema.nullish(),
        port: z.number().int().positive().nullish(),
        buildCommand: z.string().nullish(),
        startCommand: z.string().nullish(),
        installCommand: z.string().nullish(),
        description: z.string().nullish(),
      }).superRefine((input, ctx) => {
        if (input.action === 'create') {
          for (const field of ['githubAppUuid', 'repositoryOwner', 'repositoryName', 'branch', 'name', 'slug', 'port'] as const) {
            if (input[field] === undefined) {
              ctx.addIssue({ code: z.ZodIssueCode.custom, path: [field], message: `${field} is required when action is create` });
            }
          }
        }

        if (input.action !== 'create' && !input.applicationUuid) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['applicationUuid'], message: 'applicationUuid is required when action is not create' });
        }
      }),
      execute: async (input) => {
        if (input.action === 'create') {
          return coolify.createApplication({
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
        }

        if (input.action === 'delete') {
          return coolify.deleteApplication(input.applicationUuid!);
        }

        if (input.action === 'restart') {
          return coolify.restartApplication(input.applicationUuid!);
        }

        return coolify.updateApplication({
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
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'toggle_coolify_application')) {
    tools.toggle_coolify_application = createTool({
      id: 'toggle_coolify_application',
      description: 'Immediately start or stop a deployed application. Starting activates the application; stopping deactivates it without removing configuration.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        state: z.enum(['running', 'stopped']),
      }),
      execute: async (input) => input.state === 'running'
        ? coolify.startApplication(input.applicationUuid)
        : coolify.stopApplication(input.applicationUuid),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_application_deployments')) {
    tools.list_coolify_application_deployments = createTool({
      id: 'list_coolify_application_deployments',
      description: 'View deployment history for an application including timestamps, status, triggered by information, and deployment UUIDs for log retrieval.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        limit: z.number().int().positive().max(100).default(20),
      }),
      execute: async (input) => coolify.listApplicationDeployments(input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_deployment_logs')) {
    tools.get_coolify_deployment_logs = createTool({
      id: 'get_coolify_deployment_logs',
      description: 'View build and deployment logs for troubleshooting failed deployments. If deploymentUuid is omitted, retrieves logs from the most recent deployment.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        deploymentUuid: z.string().nullish(),
      }),
      execute: async (input) => coolify.getDeploymentLogs(input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application_logs')) {
    tools.get_coolify_application_logs = createTool({
      id: 'get_coolify_application_logs',
      description: 'View application runtime logs including application output, errors, and access logs. Useful for monitoring live application behavior.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        lines: z.number().int().positive().max(5000).nullish(),
        since: z.number().int().positive().nullish(),
      }),
      execute: async (input) => coolify.getApplicationLogs(input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application_envs')) {
    tools.get_coolify_application_envs = createTool({
      id: 'get_coolify_application_envs',
      description: 'Retrieve all environment variables configured for an application, including sensitive values and their current settings.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => coolify.listApplicationEnvs(input.applicationUuid),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_coolify_application_env')) {
    tools.manage_coolify_application_env = createTool({
      id: 'manage_coolify_application_env',
      description: 'Add, update, or remove environment variables for an application. Supports literal values, multiline values, and one-time secrets.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']),
        applicationUuid: z.string().min(1),
        key: z.string().min(1),
        value: z.string().nullish(),
        isPreview: z.boolean().nullish(),
        isLiteral: z.boolean().nullish(),
        isMultiline: z.boolean().nullish(),
        isShownOnce: z.boolean().nullish(),
      }).superRefine((input, ctx) => {
        if (input.action !== 'delete' && input.value === undefined) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'value is required when action is not delete' });
        }
      }),
      execute: async (input) => {
        if (input.action === 'delete') {
          return coolify.deleteApplicationEnv({
            applicationUuid: input.applicationUuid,
            key: input.key,
          });
        }

        return coolify.setApplicationEnv({
          applicationUuid: input.applicationUuid,
          key: input.key,
          value: input.value!,
          isPreview: input.isPreview,
          isLiteral: input.isLiteral,
          isMultiline: input.isMultiline,
          isShownOnce: input.isShownOnce,
        });
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
