/**
 * Coolify API client — manages applications, GitHub apps, deployments, and envs.
 */

import { z } from 'zod';

import { removeUndefined, safeJsonParse, buildRequestError } from './helpers';
import {
  extractCollection,
  extractItem,
  extractLogs,
  toTimestamp,
} from './helpers';
import {
  GitHubAppSchema,
  GitHubRepositorySchema,
  GitHubBranchSchema,
  ApplicationSchema,
  ApplicationEnvSchema,
  DeploymentSchema,
  ProjectSchema,
  EnvironmentSchema,
  ServerSchema,
} from './schemas';
import {
  getProviderConfig,
  getApplicationsBaseDomain,
} from './provider-config';
import type { createSystemIntegrationStore } from '../system-integrations/store';

export type CoolifyManager = ReturnType<typeof createCoolifyManager>;

export function createCoolifyManager(config: {
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}) {

  // ── HTTP layer ──────────────────────────────────────────────────────────────

  async function requestJson(
    method: string,
    path: string,
    body?: Record<string, unknown>,
  ) {
    const providerConfig = await getProviderConfig(config.integrations);
    const response = await fetch(
      `${providerConfig.baseUrl}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${providerConfig.adminToken}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(removeUndefined(body)) : undefined,
      },
    );

    const text = await response.text();
    const data = text.length > 0 ? safeJsonParse(text) : null;

    if (!response.ok) {
      throw new Error(buildRequestError(method, path, response.status, data ?? text));
    }

    return data;
  }

  // ── Credentials ────────────────────────────────────────────────────────────

  async function getCredentials() {
    const providerConfig = await getProviderConfig(config.integrations);

    return {
      baseUrl: providerConfig.baseUrl,
      apiToken: providerConfig.adminToken,
      serverId: providerConfig.serverId,
      destinationId: providerConfig.destinationId,
      applicationsBaseDomain: providerConfig.applicationsBaseDomain ?? null,
    };
  }

  // ── GitHub Apps ────────────────────────────────────────────────────────────

  async function listGitHubApps() {
    const data = await requestJson('GET', '/github-apps');
    const apps = extractCollection(data, GitHubAppSchema);

    return apps.map((app) => ({
      githubAppId: app.id ?? app.uuid,
      githubAppUuid: app.uuid,
      name: app.name ?? null,
      organization: app.organization ?? null,
      apiUrl: app.api_url ?? null,
      htmlUrl: app.html_url ?? null,
    }));
  }

  async function createGitHubApp(input: {
    name: string;
    organization: string;
    appId: string;
    installationId: string;
    webhookSecret: string;
  }) {
    const data = await requestJson('POST', '/github-apps', {
      name: input.name,
      organization: input.organization,
      app_id: input.appId,
      installation_id: input.installationId,
      webhook_secret: input.webhookSecret,
    });

    return { githubAppUuid: (data as { uuid: string }).uuid };
  }

  async function listGitHubAppRepositories(input: {
    githubAppId: string | number;
  }) {
    const data = await requestJson(
      'GET',
      `/github-apps/${encodeURIComponent(String(input.githubAppId))}/repositories`,
    );
    const repositories = extractCollection(data, GitHubRepositorySchema);

    return repositories.map((repo) => ({
      repositoryId: repo.id ?? repo.full_name ?? repo.name,
      fullName: repo.full_name ?? null,
      name: repo.name,
      defaultBranch: repo.default_branch ?? null,
      isPrivate: repo.private ?? null,
    }));
  }

  async function listGitHubAppRepositoryBranches(input: {
    githubAppId: string | number;
    repository: string;
  }) {
    const data = await requestJson(
      'GET',
      `/github-apps/${encodeURIComponent(String(input.githubAppId))}/repositories/${encodeURIComponent(input.repository)}/branches`,
    );
    const branches = extractCollection(data, GitHubBranchSchema);

    return branches.map((branch) => ({ name: branch.name }));
  }

  // ── Applications ───────────────────────────────────────────────────────────

  async function listApplications() {
    const data = await requestJson('GET', '/applications');
    const applications = extractCollection(data, ApplicationSchema);

    return applications.map(toApplicationSummary);
  }

  async function getApplication(applicationUuid: string) {
    const data = await requestJson(
      'GET',
      `/applications/${encodeURIComponent(applicationUuid)}`,
    );
    const application = extractItem(data, ApplicationSchema);

    return toApplicationDetails(application);
  }

  async function createApplication(input: {
    name: string;
    githubAppUuid?: string;
    buildCommand?: string;
    publishDirectory?: string;
    branch?: string;
    port?: number;
    domain?: string;
    environmentUuid?: string;
  }) {
    const payload: Record<string, unknown> = {
      name: input.name,
    };

    if (input.githubAppUuid) {
      payload.github_app_uuid = input.githubAppUuid;
    }

    if (input.buildCommand) {
      payload.build_command = input.buildCommand;
    }

    if (input.publishDirectory) {
      payload.publish_directory = input.publishDirectory;
    }

    if (input.branch) {
      payload.branch = input.branch;
    }

    if (input.port !== undefined) {
      payload.port = input.port;
    }

    if (input.domain) {
      payload.domain = input.domain;
    }

    const defaultContext = await loadDefaultDeploymentContext();
    const data = await requestJson('POST', '/applications/private-github-app', {
      ...payload,
      ...defaultContext,
      environment_uuid: input.environmentUuid ?? defaultContext.environmentUuid,
    });

    const application = extractItem(data, ApplicationSchema);

    return toApplicationDetails(application);
  }

  async function updateApplication(input: {
    applicationUuid: string;
    name?: string;
    buildCommand?: string;
    publishDirectory?: string;
    branch?: string;
    port?: number;
  }) {
    const body: Record<string, unknown> = {};

    if (input.name !== undefined) body.name = input.name;
    if (input.buildCommand !== undefined) body.build_command = input.buildCommand;
    if (input.publishDirectory !== undefined) body.publish_directory = input.publishDirectory;
    if (input.branch !== undefined) body.branch = input.branch;
    if (input.port !== undefined) body.port = input.port;

    const data = await requestJson(
      'PATCH',
      `/applications/${encodeURIComponent(input.applicationUuid)}`,
      body,
    );
    const application = extractItem(data, ApplicationSchema);

    return toApplicationDetails(application);
  }

  async function startApplication(applicationUuid: string) {
    await requestJson('GET', `/applications/${encodeURIComponent(applicationUuid)}/start`);

    return { success: true };
  }

  async function stopApplication(applicationUuid: string) {
    await requestJson('GET', `/applications/${encodeURIComponent(applicationUuid)}/stop`);

    return { success: true };
  }

  async function restartApplication(applicationUuid: string) {
    await requestJson('GET', `/applications/${encodeURIComponent(applicationUuid)}/restart`);

    return { success: true };
  }

  async function deleteApplication(applicationUuid: string) {
    await requestJson(
      'DELETE',
      `/applications/${encodeURIComponent(applicationUuid)}`,
    );

    return { success: true };
  }

  // ── Logs & Deployments ────────────────────────────────────────────────────

  async function getApplicationLogs(input: {
    applicationUuid: string;
    lines?: number;
    since?: number;
  }) {
    const query = new URLSearchParams();

    if (input.lines) query.set('lines', String(input.lines));
    if (input.since) query.set('since', String(input.since));

    const data = await requestJson(
      'GET',
      `/applications/${encodeURIComponent(input.applicationUuid)}/logs${
        query.size ? `?${query.toString()}` : ''
      }`,
    );

    return {
      applicationUuid: input.applicationUuid,
      logs: extractLogs(data),
    };
  }

  async function listApplicationDeployments(input: {
    applicationUuid: string;
    limit?: number;
  }) {
    const query = new URLSearchParams();

    if (input.limit) query.set('per_page', String(input.limit));

    const data = await requestJson(
      'GET',
      `/deployments?application_uuid=${encodeURIComponent(input.applicationUuid)}${
        query.size ? `&${query.toString()}` : ''
      }`,
    );
    const deployments = extractCollection(data, DeploymentSchema);

    return deployments
      .map((deployment) => ({
        deploymentUuid:
          deployment.uuid ?? deployment.deployment_uuid ?? String(deployment.id ?? ''),
        status: deployment.status ?? null,
        createdAt: deployment.created_at ?? null,
      }))
      .sort(
        (left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt),
      );
  }

  async function getDeploymentLogs(input: {
    applicationUuid: string;
    deploymentUuid?: string;
  }) {
    const deploymentUuid =
      input.deploymentUuid ?? await getLatestDeploymentUuid(input.applicationUuid);
    const data = await requestJson(
      'GET',
      `/deployments/${encodeURIComponent(deploymentUuid)}`,
    );
    const deployment = extractItem(data, DeploymentSchema);

    return {
      applicationUuid: input.applicationUuid,
      deploymentUuid,
      logs: deployment.logs ?? '',
      status: deployment.status ?? null,
    };
  }

  // ── Environment Variables ──────────────────────────────────────────────────

  async function listApplicationEnvs(applicationUuid: string) {
    const data = await requestJson(
      'GET',
      `/applications/${encodeURIComponent(applicationUuid)}/envs`,
    );
    const envs = extractCollection(data, ApplicationEnvSchema);

    return envs.map((env) => ({
      envId: env.uuid ?? env.id ?? env.key,
      envUuid: env.uuid ?? null,
      key: env.key,
      value: env.value ?? '',
      isPreview: env.is_preview ?? false,
      isBuildTime: env.is_build_time ?? false,
      isLiteral: env.is_literal ?? false,
      isMultiline: env.is_multiline ?? false,
      isShownOnce: env.is_shown_once ?? false,
    }));
  }

  async function setApplicationEnv(input: {
    applicationUuid: string;
    key: string;
    value: string;
    isPreview?: boolean;
    isLiteral?: boolean;
    isMultiline?: boolean;
    isShownOnce?: boolean;
  }) {
    const existing = await findApplicationEnv(input.applicationUuid, input.key);
    const body = {
      key: input.key,
      value: input.value,
      is_preview: input.isPreview ?? false,
      is_literal: input.isLiteral ?? false,
      is_multiline: input.isMultiline ?? false,
      is_shown_once: input.isShownOnce ?? false,
    };

    if (existing) {
      const data = await requestJson(
        'PATCH',
        `/applications/${encodeURIComponent(input.applicationUuid)}/envs/bulk`,
        { data: [body] },
      );
      const env = extractCollection(data, ApplicationEnvSchema).find(
        (item) => item.key === input.key,
      );

      if (!env) {
        throw new Error(
          `Coolify API did not return env ${input.key} after bulk update`,
        );
      }

      return toEnvDetails(env);
    }

    const data = await requestJson(
      'POST',
      `/applications/${encodeURIComponent(input.applicationUuid)}/envs`,
      body,
    );
    const env = extractItem(data, ApplicationEnvSchema);

    return toEnvDetails(env);
  }

  async function deleteApplicationEnv(input: {
    applicationUuid: string;
    key: string;
  }) {
    const data = await requestJson(
      'POST',
      `/applications/${encodeURIComponent(input.applicationUuid)}/envs/delete`,
      { keys: [input.key] },
    );
    const envs = extractCollection(data, ApplicationEnvSchema);

    return {
      deleted: !envs.some((env) => env.key === input.key),
    };
  }

  // ── Default context ────────────────────────────────────────────────────────

  async function loadDefaultDeploymentContext() {
    const providerConfig = await getProviderConfig(config.integrations);
    const project = await getOrCreateDefaultProject();
    const environment = await getOrCreateDefaultEnvironment(project.projectUuid);
    const server = await getDefaultServer();

    return {
      projectUuid: project.projectUuid,
      environmentUuid: environment.environmentUuid,
      serverUuid: server.uuid,
      destinationId: providerConfig.destinationId,
    };
  }

  async function getOrCreateDefaultProject() {
    const projects = extractCollection(
      await requestJson('GET', '/projects'),
      ProjectSchema,
    );

    const existing = projects.find(
      (p) => p.name === 'forge-default',
    );

    if (existing) {
      return { projectUuid: existing.uuid };
    }

    const created = extractItem(
      await requestJson('POST', '/projects', { name: 'forge-default' }),
      ProjectSchema,
    );

    return { projectUuid: created.uuid };
  }

  async function getOrCreateDefaultEnvironment(projectUuid: string) {
    const environments = extractCollection(
      await requestJson(
        'GET',
        `/projects/${encodeURIComponent(projectUuid)}/environments`,
      ),
      EnvironmentSchema,
    );

    const existing = environments.find(
      (e) => e.name === 'production',
    );

    if (existing) {
      return { environmentUuid: existing.uuid };
    }

    const created = extractItem(
      await requestJson(
        'POST',
        `/projects/${encodeURIComponent(projectUuid)}/environments`,
        { name: 'production' },
      ),
      EnvironmentSchema,
    );

    return { environmentUuid: created.uuid };
  }

  async function getDefaultServer() {
    const providerConfig = await getProviderConfig(config.integrations);
    const server = extractItem(
      await requestJson(
        'GET',
        `/servers/${encodeURIComponent(providerConfig.serverId)}`,
      ),
      ServerSchema,
    );

    return server;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  async function findApplicationEnv(
    applicationUuid: string,
    key: string,
  ) {
    const envs = await listApplicationEnvs(applicationUuid);

    return envs.find((env) => env.key === key) ?? null;
  }

  async function getLatestDeploymentUuid(applicationUuid: string) {
    const deployments = await listApplicationDeployments({
      applicationUuid,
      limit: 1,
    });

    return deployments[0]?.deploymentUuid ?? applicationUuid;
  }

  async function buildApplicationDomain(
    slug: string,
    serverUuid?: string,
  ) {
    const providerConfig = await getProviderConfig(config.integrations);
    const baseDomain =
      providerConfig.applicationsBaseDomain
      ?? await getApplicationsBaseDomain(requestJson, getDefaultServer, serverUuid);

    return `${slug}.${baseDomain}`;
  }

  return {
    getCredentials,
    listGitHubApps,
    createGitHubApp,
    listGitHubAppRepositories,
    listGitHubAppRepositoryBranches,
    listApplications,
    getApplication,
    createApplication,
    updateApplication,
    startApplication,
    stopApplication,
    restartApplication,
    deleteApplication,
    getApplicationLogs,
    listApplicationDeployments,
    getDeploymentLogs,
    listApplicationEnvs,
    setApplicationEnv,
    deleteApplicationEnv,
    buildApplicationDomain,
  };
}

// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- stable public API surface
export { normalizeDomainHost, toApplicationSummary, toApplicationDetails, toEnvDetails } from './helpers';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- stable public API surface
export { extractCollection, extractItem, extractLogs } from './helpers';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- stable public API surface
export { safeJsonParse, buildRequestError, removeUndefined, toTimestamp } from './helpers';
// eslint-disable-next-line reexport-check/no-unnecessary-reexports -- type-only public API surfaceexport type {
  GitHubAppSchema,
  GitHubRepositorySchema,
  GitHubBranchSchema,
  ApplicationSchema,
  ApplicationEnvSchema,
  DeploymentSchema,
  ProjectSchema,
  EnvironmentSchema,
  ServerSchema,
} from './schemas';
// ── Private-to-public shape adapters ────────────────────────────────────────

function toApplicationSummary(
  application: z.infer<typeof ApplicationSchema>,
) {
  return {
    applicationUuid: application.uuid,
    name: application.name ?? null,
    fqdn: application.fqdn ?? null,
    status: application.status ?? null,
    repository: application.repository ?? null,
    branch: application.git_branch ?? null,
  };
}

function toApplicationDetails(
  application: z.infer<typeof ApplicationSchema>,
) {
  return {
    applicationUuid: application.uuid,
    name: application.name ?? null,
    fqdn: application.fqdn ?? null,
    status: application.status ?? null,
    repository: application.repository ?? null,
    branch: application.git_branch ?? null,
    port: application.ports_exposes ?? null,
  };
}

function toEnvDetails(
  env: z.infer<typeof ApplicationEnvSchema>,
) {
  return {
    envId: env.uuid ?? env.id ?? env.key,
    key: env.key,
    value: env.value ?? '',
    isPreview: env.is_preview ?? false,
    isBuildTime: env.is_build_time ?? false,
    isLiteral: env.is_literal ?? false,
    isMultiline: env.is_multiline ?? false,
    isShownOnce: env.is_shown_once ?? false,
  };
}