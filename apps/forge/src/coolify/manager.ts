import { z } from 'zod';

import type { createSystemIntegrationStore } from '../system-integrations/store';

const GitHubAppSchema = z.object({
  id: z.number().int().optional(),
  uuid: z.string(),
  name: z.string().optional(),
  organization: z.string().nullish(),
  api_url: z.string().optional(),
  html_url: z.string().optional(),
}).passthrough();

const GitHubRepositorySchema = z.object({
  id: z.union([z.number().int(), z.string()]).optional(),
  name: z.string(),
  full_name: z.string().optional(),
  default_branch: z.string().optional(),
  private: z.boolean().optional(),
}).passthrough();

const GitHubBranchSchema = z.object({
  name: z.string(),
}).passthrough();

const ApplicationSchema = z.object({
  id: z.union([z.number().int(), z.string()]).optional(),
  uuid: z.string(),
  name: z.string().optional(),
  fqdn: z.string().nullish(),
  status: z.string().nullish(),
  repository: z.string().nullish(),
  git_branch: z.string().nullish(),
  ports_exposes: z.string().nullish(),
  destination: z.object({
    uuid: z.string(),
    name: z.string().optional(),
  }).optional(),
}).passthrough();

const ApplicationEnvSchema = z.object({
  id: z.union([z.number().int(), z.string()]).optional(),
  uuid: z.string().optional(),
  key: z.string(),
  value: z.string().nullish(),
  is_preview: z.boolean().optional(),
  is_build_time: z.boolean().optional(),
  is_literal: z.boolean().optional(),
  is_multiline: z.boolean().optional(),
  is_shown_once: z.boolean().optional(),
}).passthrough();

const DeploymentSchema = z.object({
  id: z.union([z.number().int(), z.string()]).optional(),
  uuid: z.string().optional(),
  deployment_uuid: z.string().optional(),
  status: z.string().nullish(),
  logs: z.string().nullish(),
  created_at: z.union([z.number(), z.string()]).optional(),
}).passthrough();

const ProjectSchema = z.object({
  uuid: z.string(),
  name: z.string().optional(),
}).passthrough();

const EnvironmentSchema = z.object({
  uuid: z.string(),
  name: z.string().optional(),
}).passthrough();

const ServerSchema = z.object({
  uuid: z.string(),
  name: z.string().optional(),
  wildcard_domain: z.string().optional(),
  proxy_uuid: z.string().optional(),
  proxy: z.object({
    uuid: z.string().optional(),
  }).partial().optional(),
}).passthrough();

export type CoolifyManager = ReturnType<typeof createCoolifyManager>;

export function createCoolifyManager(config: {
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}) {
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
    clientId: string;
    clientSecret: string;
    webhookSecret: string;
    privateKey: string;
    apiUrl?: string;
    htmlUrl?: string;
  }) {
    const data = await requestJson('POST', '/github-apps', {
      name: input.name,
      organization: input.organization,
      app_id: input.appId,
      installation_id: input.installationId,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      webhook_secret: input.webhookSecret,
      private_key: input.privateKey,
      api_url: input.apiUrl ?? 'https://api.github.com',
      html_url: input.htmlUrl ?? 'https://github.com',
    });
    const app = extractItem(data, GitHubAppSchema);

    return {
      githubAppId: app.id ?? app.uuid,
      githubAppUuid: app.uuid,
      name: app.name ?? null,
      organization: app.organization ?? null,
    };
  }

  async function listGitHubAppRepositories(input: { githubAppId: string | number }) {
    const data = await requestJson('GET', `/github-apps/${encodeURIComponent(String(input.githubAppId))}/repositories`);
    const repositories = extractCollection(data, GitHubRepositorySchema);

    return repositories.map((repository) => ({
      repositoryId: repository.id ?? repository.full_name ?? repository.name,
      name: repository.name,
      fullName: repository.full_name ?? repository.name,
      defaultBranch: repository.default_branch ?? null,
      private: repository.private ?? null,
    }));
  }

  async function listGitHubAppRepositoryBranches(input: {
    githubAppId: string | number;
    repositoryName: string;
  }) {
    const data = await requestJson(
      'GET',
      `/github-apps/${encodeURIComponent(String(input.githubAppId))}/branches?repository=${encodeURIComponent(input.repositoryName)}`,
    );
    const branches = extractCollection(data, GitHubBranchSchema);

    return branches.map((branch) => ({
      name: branch.name,
    }));
  }

  async function getGithubAppId(githubAppUuid: string): Promise<number> {
    const apps = await listGitHubApps();
    const app = apps.find((a) => a.githubAppUuid === githubAppUuid);

    if (!app) {
      throw new Error(`GitHub App with UUID ${githubAppUuid} not found`);
    }

    if (typeof app.githubAppId !== 'number') {
      throw new Error(`GitHub App ${githubAppUuid} is missing numeric githubAppId in Coolify`);
    }

    return app.githubAppId;
  }

  async function listApplications() {
    const data = await requestJson('GET', '/applications');
    const applications = extractCollection(data, ApplicationSchema);

    return applications.map(toApplicationSummary);
  }

  async function getApplication(applicationUuid: string) {
    const data = await requestJson('GET', `/applications/${encodeURIComponent(applicationUuid)}`);
    const application = extractItem(data, ApplicationSchema);

    return toApplicationDetails(application);
  }

  async function createApplication(input: {
    githubAppUuid: string;
    repositoryOwner: string;
    repositoryName: string;
    branch: string;
    name: string;
    slug: string;
    port: number;
    buildCommand?: string;
    startCommand?: string;
    installCommand?: string;
  }) {
    const deploymentContext = await loadDefaultDeploymentContext();
    const domain = await buildApplicationDomain(input.slug, deploymentContext.serverUuid);
    
    const payload: Record<string, unknown> = {
      project_uuid: deploymentContext.projectUuid,
      environment_name: deploymentContext.environmentName,
      environment_uuid: deploymentContext.environmentUuid,
      server_uuid: deploymentContext.serverUuid,
      github_app_uuid: input.githubAppUuid,
      git_repository: `${input.repositoryOwner}/${input.repositoryName}`,
      git_branch: input.branch,
      name: input.name,
      domains: domain,
      ports_exposes: String(input.port),
      build_pack: 'nixpacks', // Use nixpacks for Next.js
      build_command: input.buildCommand,
      start_command: input.startCommand,
      install_command: input.installCommand,
    };

    // Only include destination_uuid if available (optional in Coolify v4)
    if (deploymentContext.destinationUuid) {
      payload.destination_uuid = deploymentContext.destinationUuid;
    }

    const data = await requestJson('POST', '/applications/private-github-app', payload);
    const application = extractItem(data, ApplicationSchema);

    return toApplicationDetails(application);
  }

  async function updateApplication(input: {
    applicationUuid: string;
    name?: string;
    description?: string;
    port?: number;
    buildCommand?: string;
    startCommand?: string;
    installCommand?: string;
    branch?: string;
    slug?: string;
  }) {
    const body: Record<string, unknown> = {};

    if (input.name !== undefined) body.name = input.name;
    if (input.description !== undefined) body.description = input.description;
    if (input.port !== undefined) body.ports_exposes = String(input.port);
    if (input.buildCommand !== undefined) body.build_command = input.buildCommand;
    if (input.startCommand !== undefined) body.start_command = input.startCommand;
    if (input.installCommand !== undefined) body.install_command = input.installCommand;
    if (input.branch !== undefined) body.branch = input.branch;
    if (input.slug !== undefined) {
      body.fqdn = await buildApplicationDomain(input.slug);
    }

    const data = await requestJson('PATCH', `/applications/${encodeURIComponent(input.applicationUuid)}`, body);
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
    await requestJson('DELETE', `/applications/${encodeURIComponent(applicationUuid)}`);
    return { success: true };
  }

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
      `/applications/${encodeURIComponent(input.applicationUuid)}/logs${query.size ? `?${query.toString()}` : ''}`,
    );

    return {
      applicationUuid: input.applicationUuid,
      logs: extractLogs(data),
    };
  }

  async function listApplicationDeployments(input: { applicationUuid: string; limit?: number }) {
    const query = new URLSearchParams();

    if (input.limit) query.set('per_page', String(input.limit));

    const data = await requestJson(
      'GET',
      `/deployments?application_uuid=${encodeURIComponent(input.applicationUuid)}${query.size ? `&${query.toString()}` : ''}`,
    );
    const deployments = extractCollection(data, DeploymentSchema);

    return deployments
      .map((deployment) => ({
      deploymentUuid: deployment.uuid ?? deployment.deployment_uuid ?? String(deployment.id ?? ''),
      status: deployment.status ?? null,
      createdAt: deployment.created_at ?? null,
      }))
      .sort((left, right) => toTimestamp(right.createdAt) - toTimestamp(left.createdAt));
  }

  async function getDeploymentLogs(input: {
    applicationUuid: string;
    deploymentUuid?: string;
  }) {
    const deploymentUuid = input.deploymentUuid ?? await getLatestDeploymentUuid(input.applicationUuid);
    const data = await requestJson('GET', `/deployments/${encodeURIComponent(deploymentUuid)}`);
    const deployment = extractItem(data, DeploymentSchema);

    return {
      applicationUuid: input.applicationUuid,
      deploymentUuid,
      logs: deployment.logs ?? '',
      status: deployment.status ?? null,
    };
  }

  async function listApplicationEnvs(applicationUuid: string) {
    const data = await requestJson('GET', `/applications/${encodeURIComponent(applicationUuid)}/envs`);
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
        {
          data: [body],
        },
      );
      const env = extractCollection(data, ApplicationEnvSchema).find((item) => item.key === input.key);

      if (!env) {
        throw new Error(`Coolify API did not return env ${input.key} after bulk update`);
      }

      return toEnvDetails(env);
    }

    const data = await requestJson('POST', `/applications/${encodeURIComponent(input.applicationUuid)}/envs`, body);
    const env = extractItem(data, ApplicationEnvSchema);
    return toEnvDetails(env);
  }

  async function deleteApplicationEnv(input: {
    applicationUuid: string;
    key: string;
  }) {
    const existing = await findApplicationEnv(input.applicationUuid, input.key);

    if (!existing?.envUuid) {
      return { success: false };
    }

    await requestJson(
      'DELETE',
      `/applications/${encodeURIComponent(input.applicationUuid)}/envs/${encodeURIComponent(existing.envUuid)}`,
    );

    return { success: true };
  }

  return {
    listGitHubApps,
    createGitHubApp,
    listGitHubAppRepositories,
    listGitHubAppRepositoryBranches,
    listApplications,
    createApplication,
    getApplication,
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
  };

  async function loadDefaultDeploymentContext() {
    const project = await getOrCreateDefaultProject();
    const environment = await getOrCreateDefaultEnvironment(project.uuid);
    const server = await getDefaultServer();
    const destinationUuid = await getServerDestinationUuid(server.uuid, server);

    return {
      projectUuid: project.uuid,
      environmentUuid: environment.uuid,
      environmentName: environment.name ?? 'production',
      serverUuid: server.uuid,
      destinationUuid,
    };
  }

  async function getOrCreateDefaultProject() {
    const data = await requestJson('GET', '/projects');
    const projects = extractCollection(data, ProjectSchema);

    if (projects.length > 0) {
      return projects[0];
    }

    const created = await requestJson('POST', '/projects', {
      name: 'Forge',
      description: 'Default project created by Forge for Coolify deployments.',
    });

    return extractItem(created, ProjectSchema);
  }

  async function getOrCreateDefaultEnvironment(projectUuid: string) {
    const data = await requestJson('GET', `/projects/${encodeURIComponent(projectUuid)}/environments`);
    const environments = extractCollection(data, EnvironmentSchema);
    const production = environments.find((environment) => environment.name === 'production');

    if (production) {
      return production;
    }

    if (environments.length > 0) {
      return environments[0];
    }

    const created = await requestJson('POST', `/projects/${encodeURIComponent(projectUuid)}/environments`, {
      name: 'production',
    });

    return extractItem(created, EnvironmentSchema);
  }

  async function getDefaultServer() {
    const data = await requestJson('GET', '/servers');
    const servers = extractCollection(data, ServerSchema);

    if (servers.length === 0) {
      throw new Error('Coolify has no server configured');
    }

    return servers[0];
  }

  async function getServerDestinationUuid(serverUuid: string, cachedServer?: z.infer<typeof ServerSchema>) {
    // First try: direct fields on server (legacy compatibility)
    const server = cachedServer ?? extractItem(await requestJson('GET', `/servers/${encodeURIComponent(serverUuid)}`), ServerSchema);
    const directDestination = server.proxy?.uuid ?? server.proxy_uuid;

    if (directDestination) {
      return directDestination;
    }

    // Second try: get destination from an existing application on this server
    // This is the correct approach for Coolify v4 where destinations are stored per-application
    const applications = extractCollection(await requestJson('GET', '/applications'), ApplicationSchema);
    const appWithDestination = applications.find((app) => app.destination?.uuid);

    if (appWithDestination?.destination?.uuid) {
      console.log(`[Coolify] Found destination ${appWithDestination.destination.uuid} from application ${appWithDestination.name} (${appWithDestination.uuid})`);
      return appWithDestination.destination.uuid;
    }

    // Third try: find destination from server resources (legacy compatibility)
    const resources = await requestJson('GET', `/servers/${encodeURIComponent(serverUuid)}/resources`);
    const resource = extractFirstMatchingCollectionItem(resources, z.object({
      uuid: z.string(),
      type: z.string().optional(),
      name: z.string().optional(),
    }).passthrough(), (item) => {
      const haystack = `${item.type ?? ''} ${item.name ?? ''}`.toLowerCase();
      return haystack.includes('proxy') || haystack.includes('destination');
    });

    if (resource) {
      return resource.uuid;
    }

    // Fourth try: search all servers for destinations
    const servers = extractCollection(await requestJson('GET', '/servers'), ServerSchema);
    for (const s of servers) {
      if (s.proxy?.uuid || s.proxy_uuid) {
        const dest = s.proxy?.uuid ?? s.proxy_uuid;
        console.log(`[Coolify] Found destination ${dest} on server ${s.uuid} (searched for ${serverUuid})`);
        return dest;
      }
    }

    // Destination is optional in Coolify v4 - Coolify will use the default server destination
    console.log(`[Coolify] No destination found for server ${serverUuid}. This is optional in Coolify v4.`);
    return null;
  }

  async function findApplicationEnv(applicationUuid: string, key: string) {
    const envs = await listApplicationEnvs(applicationUuid);
    return envs.find((env) => env.key === key) ?? null;
  }

  async function getLatestDeploymentUuid(applicationUuid: string) {
    const deployments = await listApplicationDeployments({ applicationUuid, limit: 1 });
    const deployment = deployments[0];

    if (!deployment?.deploymentUuid) {
      throw new Error(`No deployment found for Coolify application ${applicationUuid}`);
    }

    return deployment.deploymentUuid;
  }

  async function requestJson(method: string, path: string, body?: Record<string, unknown>) {
    const providerConfig = await getProviderConfig();
    const response = await fetch(`${providerConfig.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${providerConfig.adminToken}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(removeUndefined(body)) : undefined,
    });

    const text = await response.text();
    const data = text.length > 0 ? safeJsonParse(text) : null;

    if (!response.ok) {
      throw new Error(buildRequestError(method, path, response.status, data ?? text));
    }

    return data;
  }

  async function buildApplicationDomain(slug: string, serverUuid?: string) {
    const providerConfig = await getProviderConfig();
    const baseDomain = providerConfig.applicationsBaseDomain
      ?? await getApplicationsBaseDomain(serverUuid);

    return `${slug}.${baseDomain}`;
  }

  async function getProviderConfig() {
    const integration = await config.integrations.getCoolifyConfig();

    if (!integration) {
      throw new Error(
        'Coolify integration requires a configured admin connection in system integrations',
      );
    }

    return {
      baseUrl: `${integration.baseUrl.replace(/\/$/, '')}/api/v1`,
      adminToken: integration.adminToken,
      applicationsBaseDomain: integration.applicationsBaseDomain?.replace(/^\./, '').trim() || null,
    };
  }

  async function getApplicationsBaseDomain(serverUuid?: string) {
    const server = serverUuid
      ? extractItem(await requestJson('GET', `/servers/${encodeURIComponent(serverUuid)}`), ServerSchema)
      : await getDefaultServer();
    const wildcardDomain = server.wildcard_domain?.replace(/^\./, '').trim();

    if (!wildcardDomain) {
      throw new Error(
        'Coolify integration could not determine a wildcard domain from the server configuration',
      );
    }

    return wildcardDomain;
  }
}

function extractCollection<T>(data: unknown, schema: z.ZodSchema<T>) {
  if (Array.isArray(data)) {
    return z.array(schema).parse(data);
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;

    for (const key of ['data', 'applications', 'github_apps', 'repositories', 'deployments', 'envs', 'projects', 'environments', 'servers', 'branches']) {
      if (Array.isArray(record[key])) {
        return z.array(schema).parse(record[key]);
      }
    }
  }

  return [];
}

function extractItem<T>(data: unknown, schema: z.ZodSchema<T>) {
  if (data && typeof data === 'object') {
    const parsed = schema.safeParse(data);

    if (parsed.success) {
      return parsed.data;
    }

    const record = data as Record<string, unknown>;

    for (const key of ['data', 'application', 'github_app', 'deployment', 'server', 'project', 'environment', 'env']) {
      const value = record[key];

      if (value && typeof value === 'object') {
        return schema.parse(value);
      }
    }
  }

  return schema.parse(data);
}

function extractFirstMatchingCollectionItem<T>(data: unknown, schema: z.ZodSchema<T>, predicate: (item: T) => boolean) {
  const items = extractCollection(data, schema);
  return items.find(predicate) ?? null;
}

function extractLogs(data: unknown) {
  if (typeof data === 'string') {
    return data;
  }

  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;

    for (const key of ['logs', 'data', 'output']) {
      const value = record[key];

      if (typeof value === 'string') {
        return value;
      }
    }
  }

  return '';
}

function toApplicationSummary(application: z.infer<typeof ApplicationSchema>) {
  return {
    applicationUuid: application.uuid,
    name: application.name ?? null,
    fqdn: application.fqdn ?? null,
    status: application.status ?? null,
    repository: application.repository ?? null,
    branch: application.git_branch ?? null,
  };
}

function toApplicationDetails(application: z.infer<typeof ApplicationSchema>) {
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

function toEnvDetails(env: z.infer<typeof ApplicationEnvSchema>) {
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

function removeUndefined(record: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function buildRequestError(method: string, path: string, status: number, data: unknown) {
  const payload = typeof data === 'string' ? data : JSON.stringify(data);
  return `Coolify API ${method} ${path} failed with ${status}: ${payload}`;
}

function toTimestamp(value: string | number | null) {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);

    if (Number.isFinite(numeric)) {
      return numeric;
    }

    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return 0;
}
