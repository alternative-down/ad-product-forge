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
      description: 'List the GitHub Apps currently registered in Coolify.',
      inputSchema: z.object({}),
      execute: async () => coolify.listGitHubApps(),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_github_app_repositories')) {
    tools.list_coolify_github_app_repositories = createTool({
      id: 'list_coolify_github_app_repositories',
      description: 'List repositories accessible to one Coolify GitHub App.',
      inputSchema: z.object({
        githubAppId: z.union([z.string().min(1), z.number().int()]),
      }),
      execute: async (input) => coolify.listGitHubAppRepositories(input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_github_app_repository_branches')) {
    tools.list_coolify_github_app_repository_branches = createTool({
      id: 'list_coolify_github_app_repository_branches',
      description: 'List branches for one repository accessible to a Coolify GitHub App.',
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
      description: 'List applications currently managed by Coolify.',
      inputSchema: z.object({}),
      execute: async () => coolify.listApplications(),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application')) {
    tools.get_coolify_application = createTool({
      id: 'get_coolify_application',
      description: 'Get one Coolify application by applicationUuid.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => coolify.getApplication(input.applicationUuid),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_coolify_application')) {
    tools.manage_coolify_application = createTool({
      id: 'manage_coolify_application',
      description: 'Manage Coolify applications: create new applications linked to GitHub repositories, update configurations, delete applications, or restart running applications. Each action has different required parameters - check inputSchema for details.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete', 'restart']),
        applicationUuid: z.string().min(1).optional(),
        githubAppUuid: z.string().min(1).optional(),
        repositoryOwner: z.string().min(1).optional(),
        repositoryName: z.string().min(1).optional(),
        branch: z.string().min(1).optional(),
        name: z.string().min(1).optional(),
        slug: coolifyApplicationSlugSchema.optional(),
        port: z.number().int().positive().optional(),
        buildCommand: z.string().optional(),
        startCommand: z.string().optional(),
        installCommand: z.string().optional(),
        description: z.string().optional(),
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
      description: 'Start or stop one Coolify application.',
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
      description: 'List recent deployments for one Coolify application.',
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
      description: 'Get deployment logs for one Coolify application. If deploymentUuid is omitted, the latest deployment is used.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        deploymentUuid: z.string().optional(),
      }),
      execute: async (input) => coolify.getDeploymentLogs(input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application_logs')) {
    tools.get_coolify_application_logs = createTool({
      id: 'get_coolify_application_logs',
      description: 'Get runtime logs for one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        lines: z.number().int().positive().max(5000).optional(),
        since: z.number().int().positive().optional(),
      }),
      execute: async (input) => coolify.getApplicationLogs(input),
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application_envs')) {
    tools.get_coolify_application_envs = createTool({
      id: 'get_coolify_application_envs',
      description: 'Get environment variables for one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => coolify.listApplicationEnvs(input.applicationUuid),
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_coolify_application_env')) {
    tools.manage_coolify_application_env = createTool({
      id: 'manage_coolify_application_env',
      description: 'Create, update, or delete one environment variable for one Coolify application.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']),
        applicationUuid: z.string().min(1),
        key: z.string().min(1),
        value: z.string().optional(),
        isPreview: z.boolean().optional(),
        isLiteral: z.boolean().optional(),
        isMultiline: z.boolean().optional(),
        isShownOnce: z.boolean().optional(),
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
