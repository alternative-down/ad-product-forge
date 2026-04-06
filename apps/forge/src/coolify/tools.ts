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

  if (hasToolPermission(allowedToolIds, 'get_coolify_credentials')) {
    tools.get_coolify_credentials = createTool({
      id: 'get_coolify_credentials',
      description: 'Get the Coolify API credentials configured for Forge so you can call the Coolify API directly with curl.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          forgeDebug('tools:coolify', 'get_coolify_credentials called');
          const result = await coolify.getCredentials();
          forgeDebug('tools:coolify', 'get_coolify_credentials result', { hasBaseUrl: !!result.baseUrl });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'get_coolify_credentials error', { error: message });
          return {
            valid: false,
            error: message,
            hint: 'Verify Coolify integration is configured and enabled.',
          };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_github_apps')) {
    tools.list_coolify_github_apps = createTool({
      id: 'list_coolify_github_apps',
      description: 'List the GitHub Apps available in Coolify. Use this before choosing a repository to deploy.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          forgeDebug('tools:coolify', 'list_coolify_github_apps called');
          const result = await coolify.listGitHubApps();
          forgeDebug('tools:coolify', 'list_coolify_github_apps result', { count: result.length });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'list_coolify_github_apps error', { error: message });
          return { valid: false, error: message, hint: 'Verify Coolify integration is properly configured.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_github_app_repositories')) {
    tools.list_coolify_github_app_repositories = createTool({
      id: 'list_coolify_github_app_repositories',
      description: 'List the repositories that one Coolify GitHub App can access. Use this to find a repository you want to deploy.',
      inputSchema: z.object({
        githubAppId: z.union([z.string().min(1), z.number().int()]).describe('The GitHub App ID to inspect.'),
      }),
      execute: async (input) => {
        try {
          forgeDebug('tools:coolify', 'list_coolify_github_app_repositories called', { githubAppId: input.githubAppId });
          const result = await coolify.listGitHubAppRepositories(input);
          forgeDebug('tools:coolify', 'list_coolify_github_app_repositories result', { count: result.length });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'list_coolify_github_app_repositories error', { error: message });
          return { valid: false, error: message, hint: 'Use list_coolify_github_apps to verify the GitHub App ID is valid.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_github_app_repository_branches')) {
    tools.list_coolify_github_app_repository_branches = createTool({
      id: 'list_coolify_github_app_repository_branches',
      description: 'List the available branches for one repository. Use this before creating or updating a deployment.',
      inputSchema: z.object({
        githubAppId: z.union([z.string().min(1), z.number().int()]).describe('The GitHub App ID that can access the repository.'),
        repositoryName: z.string().min(1).describe('The repository name you want to inspect.'),
      }),
      execute: async (input) => {
        try {
          forgeDebug('tools:coolify', 'list_coolify_github_app_repository_branches called', { githubAppId: input.githubAppId, repositoryName: input.repositoryName });
          const result = await coolify.listGitHubAppRepositoryBranches(input);
          forgeDebug('tools:coolify', 'list_coolify_github_app_repository_branches result', { count: result.length });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'list_coolify_github_app_repository_branches error', { error: message });
          return { valid: false, error: message, hint: 'Verify the GitHub App ID and repository name are correct.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_applications')) {
    tools.list_coolify_applications = createTool({
      id: 'list_coolify_applications',
      description: 'List the applications managed in Coolify. Use this to review existing deployments and get the applicationUuid needed for later actions.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          forgeDebug('tools:coolify', 'list_coolify_applications called');
          const result = await coolify.listApplications();
          forgeDebug('tools:coolify', 'list_coolify_applications result', { count: result.length });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'list_coolify_applications error', { error: message });
          return { valid: false, error: message, hint: 'Verify Coolify has applications deployed and is accessible.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application')) {
    tools.get_coolify_application = createTool({
      id: 'get_coolify_application',
      description: 'Show the details of one Coolify application, including its current configuration and status.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => {
        try {
          forgeDebug('tools:coolify', 'get_coolify_application called', { applicationUuid: input.applicationUuid });
          const result = await coolify.getApplication(input.applicationUuid);
          forgeDebug('tools:coolify', 'get_coolify_application result', { found: !!result });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'get_coolify_application error', { error: message });
          return { valid: false, error: message, hint: 'Use list_coolify_applications to find valid application UUIDs.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_coolify_application')) {
    tools.manage_coolify_application = createTool({
      id: 'manage_coolify_application',
      description: 'Create, update, delete, or restart a Coolify application. Use this to manage deployments backed by a GitHub repository.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete', 'restart']).describe('Choose what you want to do with the application.'),
        applicationUuid: z.string().min(1).nullish().describe('The applicationUuid to use for update, delete, or restart.'),
        githubAppUuid: z.string().min(1).nullish().describe('The GitHub App that should be used to access the repository.'),
        repositoryOwner: z.string().min(1).nullish().describe('The organization or user that owns the repository.'),
        repositoryName: z.string().min(1).nullish().describe('The repository name to deploy.'),
        branch: z.string().min(1).nullish().describe('The branch that Coolify should deploy.'),
        name: z.string().min(1).nullish().describe('The display name of the application in Coolify.'),
        slug: coolifyApplicationSlugSchema.nullish().describe('A lowercase kebab-case slug to use for the application and its subdomain.'),
        port: z.number().int().positive().nullish().describe('The port your application listens on.'),
        buildCommand: z.string().nullish().describe('Optional build command.'),
        startCommand: z.string().nullish().describe('Optional start command.'),
        installCommand: z.string().nullish().describe('Optional install command.'),
        description: z.string().nullish().describe('Optional description of the application.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'manage_coolify_application called', { action: input.action, applicationUuid: input.applicationUuid });
        if (input.action === 'create') {
          const requiredFields = ['githubAppUuid', 'repositoryOwner', 'repositoryName', 'branch', 'name', 'slug', 'port'] as const;
          for (const field of requiredFields) {
            if (input[field] === undefined) {
              forgeDebug('tools:coolify', 'manage_coolify_application validation failed', { reason: `${field} required for create`, action: input.action });
              return { valid: false, error: `${field} is required when action is create`, hint: `Provide all required fields: githubAppUuid, repositoryOwner, repositoryName, branch, name, slug, port.` };
            }
          }
        }

        if (input.action !== 'create' && !input.applicationUuid) {
          forgeDebug('tools:coolify', 'manage_coolify_application validation failed', { reason: 'applicationUuid required for non-create', action: input.action });
          return { valid: false, error: 'applicationUuid is required when action is not create', hint: 'Use list_coolify_applications to find valid application UUIDs.' };
        }

        let result;
        try {
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
          return { valid: true, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'manage_coolify_application error', { error: message });
          return { valid: false, error: message, hint: 'Verify Coolify integration is configured and application UUID is valid.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'toggle_coolify_application')) {
    tools.toggle_coolify_application = createTool({
      id: 'toggle_coolify_application',
      description: 'Start or stop a Coolify application without deleting it.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1).describe('The applicationUuid of the application you want to start or stop.'),
        state: z.enum(['running', 'stopped']).describe('Use "running" to start the application or "stopped" to stop it.'),
      }),
      execute: async (input) => {
        try {
          forgeDebug('tools:coolify', 'toggle_coolify_application called', { applicationUuid: input.applicationUuid, state: input.state });
          const result = input.state === 'running'
            ? await coolify.startApplication(input.applicationUuid)
            : await coolify.stopApplication(input.applicationUuid);
          forgeDebug('tools:coolify', 'toggle_coolify_application result', { state: input.state, result });
          return { valid: true, applicationUuid: input.applicationUuid, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'toggle_coolify_application error', { error: message });
          return { valid: false, error: message, hint: 'Use list_coolify_applications to verify the application exists.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'list_coolify_application_deployments')) {
    tools.list_coolify_application_deployments = createTool({
      id: 'list_coolify_application_deployments',
      description: 'List recent deployments for one Coolify application. Use this to inspect deployment history and get a deploymentUuid for logs.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1).describe('The applicationUuid of the application you want to inspect.'),
        limit: z.number().int().positive().max(100).default(20).describe('Maximum number of deployments to return.'),
      }),
      execute: async (input) => {
        try {
          forgeDebug('tools:coolify', 'list_coolify_application_deployments called', { applicationUuid: input.applicationUuid, limit: input.limit });
          const result = await coolify.listApplicationDeployments(input);
          forgeDebug('tools:coolify', 'list_coolify_application_deployments result', { count: result.length });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'list_coolify_application_deployments error', { error: message });
          return { valid: false, error: message, hint: 'Use list_coolify_applications to verify the application UUID is valid.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_deployment_logs')) {
    tools.get_coolify_deployment_logs = createTool({
      id: 'get_coolify_deployment_logs',
      description: 'Show build and deployment logs for one application. If you omit deploymentUuid, the latest deployment logs are returned.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1).describe('The applicationUuid of the application you want to inspect.'),
        deploymentUuid: z.string().nullish().describe('Optional deploymentUuid if you want logs from one specific deployment.'),
      }),
      execute: async (input) => {
        try {
          forgeDebug('tools:coolify', 'get_coolify_deployment_logs called', { applicationUuid: input.applicationUuid, deploymentUuid: input.deploymentUuid });
          const result = await coolify.getDeploymentLogs(input);
          forgeDebug('tools:coolify', 'get_coolify_deployment_logs result', { deploymentUuid: result.deploymentUuid, status: result.status });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'get_coolify_deployment_logs error', { error: message });
          return { valid: false, error: message, hint: 'Verify the application UUID and deployment UUID are valid.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application_logs')) {
    tools.get_coolify_application_logs = createTool({
      id: 'get_coolify_application_logs',
      description: 'Show runtime logs for one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1).describe('The applicationUuid of the application you want to inspect.'),
        lines: z.number().int().positive().max(5000).nullish().describe('Optional number of log lines to return.'),
        since: z.number().int().positive().nullish().describe('Optional Unix timestamp if you want logs only after that time.'),
      }),
      execute: async (input) => {
        try {
          forgeDebug('tools:coolify', 'get_coolify_application_logs called', { applicationUuid: input.applicationUuid, lines: input.lines, since: input.since });
          const result = await coolify.getApplicationLogs(input);
          forgeDebug('tools:coolify', 'get_coolify_application_logs result', { applicationUuid: result.applicationUuid });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'get_coolify_application_logs error', { error: message });
          return { valid: false, error: message, hint: 'Use list_coolify_applications to verify the application UUID is valid.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'get_coolify_application_envs')) {
    tools.get_coolify_application_envs = createTool({
      id: 'get_coolify_application_envs',
      description: 'List the environment variables configured for one Coolify application.',
      inputSchema: z.object({
        applicationUuid: z.string().min(1),
      }),
      execute: async (input) => {
        try {
          forgeDebug('tools:coolify', 'get_coolify_application_envs called', { applicationUuid: input.applicationUuid });
          const result = await coolify.listApplicationEnvs(input.applicationUuid);
          forgeDebug('tools:coolify', 'get_coolify_application_envs result', { count: result.length });
          return result;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'get_coolify_application_envs error', { error: message });
          return { valid: false, error: message, hint: 'Use list_coolify_applications to verify the application UUID is valid.' };
        }
      },
    });
  }

  if (hasToolPermission(allowedToolIds, 'manage_coolify_application_env')) {
    tools.manage_coolify_application_env = createTool({
      id: 'manage_coolify_application_env',
      description: 'Create, update, or delete one environment variable for a Coolify application.',
      inputSchema: z.object({
        action: z.enum(['create', 'update', 'delete']).describe('Choose whether to create, update, or delete the environment variable.'),
        applicationUuid: z.string().min(1).describe('The applicationUuid of the application you want to change.'),
        key: z.string().min(1).describe('The environment variable name.'),
        value: z.string().nullish().describe('The environment variable value. Required for create and update.'),
        isPreview: z.boolean().nullish().describe('Optional flag for preview environments.'),
        isLiteral: z.boolean().nullish().describe('Optional flag to save the value as a literal value.'),
        isMultiline: z.boolean().nullish().describe('Optional flag if the value contains multiple lines.'),
        isShownOnce: z.boolean().nullish().describe('Optional flag if the value should only be shown once after creation.'),
      }),
      execute: async (input) => {
        forgeDebug('tools:coolify', 'manage_coolify_application_env called', { action: input.action, applicationUuid: input.applicationUuid, key: input.key });
        if (input.action !== 'delete' && input.value === undefined) {
          forgeDebug('tools:coolify', 'manage_coolify_application_env validation failed', { reason: 'value required for non-delete' });
          return { valid: false, error: 'value is required when action is not delete', hint: 'Provide the value parameter for create or update actions.' };
        }

        let result;
        try {
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
          return { valid: true, applicationUuid: input.applicationUuid, key: input.key, ...result };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          forgeDebug('tools:coolify', 'manage_coolify_application_env error', { error: message });
          return { valid: false, error: message, hint: 'Verify the application UUID and key are valid.' };
        }
      },
    });
  }

  return tools as Record<string, Tool<unknown, unknown>>;
}
