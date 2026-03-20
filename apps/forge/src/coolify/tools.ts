import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import type { CoolifyManager } from './manager.js';

const coolifyApplicationSlugSchema = z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, {
  message: 'slug must be lowercase kebab-case and valid for subdomain use',
});

export function createCoolifyTools(coolify: CoolifyManager) {
  return {
    list_coolify_github_apps: createTool({
      id: 'list_coolify_github_apps',
      description: 'List the GitHub Apps currently registered in Coolify.',
      inputSchema: z.object({}),
      execute: async () => coolify.listGitHubApps(),
    }),
    create_coolify_github_app: createTool({
      id: 'create_coolify_github_app',
      description: 'Register a GitHub App inside Coolify so it can be used as a repository source.',
      inputSchema: z.object({
        name: z.string().min(1),
        organization: z.string().min(1),
        appId: z.string().min(1),
        installationId: z.string().min(1),
        clientId: z.string().min(1),
        clientSecret: z.string().min(1),
        webhookSecret: z.string().min(1),
        privateKey: z.string().min(1),
        apiUrl: z.string().url().optional(),
        htmlUrl: z.string().url().optional(),
      }),
      execute: async (input) => coolify.createGitHubApp(input),
    }),
    list_coolify_github_app_repositories: createTool({
      id: 'list_coolify_github_app_repositories',
      description: 'List repositories accessible to one Coolify GitHub App.',
      inputSchema: z.object({
        githubAppId: z.union([z.string().min(1), z.number().int()]),
      }),
      execute: async (input) => coolify.listGitHubAppRepositories(input),
    }),
    list_coolify_github_app_repository_branches: createTool({
      id: 'list_coolify_github_app_repository_branches',
      description: 'List branches for one repository accessible to a Coolify GitHub App.',
      inputSchema: z.object({
        githubAppId: z.union([z.string().min(1), z.number().int()]),
        repositoryName: z.string().min(1),
      }),
      execute: async (input) => coolify.listGitHubAppRepositoryBranches(input),
    }),
    list_coolify_applications: createTool({
      id: 'list_coolify_applications',
      description: 'List applications currently managed by Coolify.',
      inputSchema: z.object({}),
      execute: async () => coolify.listApplications(),
    }),
    create_coolify_application: createTool({
      id: 'create_coolify_application',
      description: 'Create a Coolify application from a repository available through a Coolify GitHub App using Forge defaults.',
      inputSchema: z.object({
        githubAppUuid: z.string().min(1),
        repositoryOwner: z.string().min(1),
        repositoryName: z.string().min(1),
        branch: z.string().min(1),
        name: z.string().min(1),
        slug: coolifyApplicationSlugSchema,
        port: z.number().int().positive(),
        buildCommand: z.string().optional(),
        startCommand: z.string().optional(),
        installCommand: z.string().optional(),
      }),
      execute: async (input) => coolify.createApplication(input),
    }),
    get_coolify_application: createTool({
      id: 'get_coolify_application',
      description: 'Get one Coolify application by applicationUuid.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => coolify.getApplication(input.applicationUuid),
    }),
    update_coolify_application: createTool({
      id: 'update_coolify_application',
      description: 'Partially update one Coolify application configuration.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        name: z.string().optional(),
        description: z.string().optional(),
        port: z.number().int().positive().optional(),
        buildCommand: z.string().optional(),
        startCommand: z.string().optional(),
        installCommand: z.string().optional(),
        branch: z.string().optional(),
        slug: coolifyApplicationSlugSchema.optional(),
      }).refine((input) => Object.keys(input).length > 1, {
        message: 'At least one field besides applicationUuid must be provided',
      }),
      execute: async (input) => coolify.updateApplication(input),
    }),
    start_coolify_application: createTool({
      id: 'start_coolify_application',
      description: 'Start one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => coolify.startApplication(input.applicationUuid),
    }),
    stop_coolify_application: createTool({
      id: 'stop_coolify_application',
      description: 'Stop one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => coolify.stopApplication(input.applicationUuid),
    }),
    restart_coolify_application: createTool({
      id: 'restart_coolify_application',
      description: 'Restart one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => coolify.restartApplication(input.applicationUuid),
    }),
    delete_coolify_application: createTool({
      id: 'delete_coolify_application',
      description: 'Delete one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => coolify.deleteApplication(input.applicationUuid),
    }),
    list_coolify_application_deployments: createTool({
      id: 'list_coolify_application_deployments',
      description: 'List recent deployments for one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        limit: z.number().int().positive().max(100).default(20),
      }),
      execute: async (input) => coolify.listApplicationDeployments(input),
    }),
    get_coolify_deployment_logs: createTool({
      id: 'get_coolify_deployment_logs',
      description: 'Get deployment logs for one Coolify application. If deploymentUuid is omitted, the latest deployment is used.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        deploymentUuid: z.string().optional(),
      }),
      execute: async (input) => coolify.getDeploymentLogs(input),
    }),
    get_coolify_application_logs: createTool({
      id: 'get_coolify_application_logs',
      description: 'Get runtime logs for one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        lines: z.number().int().positive().max(5000).optional(),
        since: z.number().int().positive().optional(),
      }),
      execute: async (input) => coolify.getApplicationLogs(input),
    }),
    list_coolify_application_envs: createTool({
      id: 'list_coolify_application_envs',
      description: 'List environment variables for one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => coolify.listApplicationEnvs(input.applicationUuid),
    }),
    set_coolify_application_env: createTool({
      id: 'set_coolify_application_env',
      description: 'Create or update one environment variable for one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        key: z.string().min(1),
        value: z.string(),
        isBuildTime: z.boolean().optional(),
        isPreview: z.boolean().optional(),
        isLiteral: z.boolean().optional(),
        isMultiline: z.boolean().optional(),
        isShownOnce: z.boolean().optional(),
      }),
      execute: async (input) => coolify.setApplicationEnv(input),
    }),
    delete_coolify_application_env: createTool({
      id: 'delete_coolify_application_env',
      description: 'Delete one environment variable from one Coolify application by key.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
        key: z.string().min(1),
      }),
      execute: async (input) => coolify.deleteApplicationEnv(input),
    }),
  };
}
