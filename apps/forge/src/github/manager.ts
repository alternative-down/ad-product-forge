import crypto from 'node:crypto';

import { createId } from '@paralleldrive/cuid2';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from 'octokit';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../database/index.js';
import { agentProviders, type NewAgentProvider } from '../database/schema.js';
import { encryptSecret, decryptSecret } from '../encryption/crypto.js';
import type { createForgeHttpServer, HttpResponse } from '../http/server.js';
import { createAgentNotificationStore } from '../notifications/store.js';
import { githubAppCredentialsSchema, type GitHubAppCredentials } from './types.js';

const GITHUB_PROVIDER_TYPE = 'github-app';
const manifestConversionSchema = z.object({
  id: z.number().int(),
  pem: z.string(),
  webhook_secret: z.string(),
});

export type GitHubAppProvisioning = {
  agentId: string;
  status: GitHubAppCredentials['status'];
  registrationUrl: string;
  installUrl?: string;
};

export type GitHubAppManager = ReturnType<typeof createGitHubAppManager>;

export function createGitHubAppManager(config: {
  db: Database;
  httpServer: ReturnType<typeof createForgeHttpServer>;
  publicBaseUrl: string;
  organization: string;
  appHomeUrl: string;
  notifyAgent(agentId: string): void;
}) {
  const notifications = createAgentNotificationStore(config.db);
  const routeCleanups = new Map<string, Array<() => void>>();

  async function ensureAgentApp(input: { agentId: string; agentName: string }) {
    const existing = await getCredentials(input.agentId);

    if (!existing) {
      const credentials = {
        status: 'pending' as const,
        state: crypto.randomUUID(),
        appName: createAppName(input.agentName, input.agentId),
        createdAt: Date.now(),
      };

      await saveCredentials(input.agentId, credentials);
      registerAgentRoutes(input.agentId);
      return buildProvisioning(input.agentId, credentials);
    }

    registerAgentRoutes(input.agentId);
    return buildProvisioning(input.agentId, existing);
  }

  async function loadAllAgents() {
    const providerRows = await config.db.query.agentProviders.findMany({
      where: eq(agentProviders.providerType, GITHUB_PROVIDER_TYPE),
    });

    for (const row of providerRows) {
      const credentials = parseCredentials(row.encryptedCredentials);

      if (!credentials) {
        continue;
      }

      registerAgentRoutes(row.agentId);
    }
  }

  function unloadAgent(agentId: string) {
    const cleanups = routeCleanups.get(agentId) ?? [];

    for (const cleanup of cleanups) {
      cleanup();
    }

    routeCleanups.delete(agentId);
  }

  async function deleteAgentApp(agentId: string) {
    const credentials = await getCredentials(agentId);

    unloadAgent(agentId);

    if (!credentials) {
      return;
    }

    if (credentials.status === 'active') {
      const appOctokit = createAppOctokit({
        appId: credentials.appId,
        privateKey: credentials.privateKey,
      });

      await appOctokit.request('DELETE /app/installations/{installation_id}', {
        installation_id: credentials.installationId,
      });
    }
  }

  async function getGitCredentials(input: {
    agentId: string;
    repositoryName?: string;
  }) {
    const credentials = await getActiveCredentials(input.agentId);
    const token = await getInstallationToken(credentials);
    const repositoryUrl = input.repositoryName
      ? `https://github.com/${config.organization}/${input.repositoryName}.git`
      : undefined;

    return {
      username: 'x-access-token',
      token: token.token,
      expiresAt: token.expiresAt,
      repositoryUrl,
      gitUserName: credentials.appName,
      gitUserEmail: `${credentials.appSlug}@forge.github-app.local`,
    };
  }

  async function listRepositories(agentId: string) {
    const octokit = await getInstallationOctokit(agentId);
    const response = await octokit.request('GET /installation/repositories', {
      per_page: 100,
    });

    return response.data.repositories.map((repository) => ({
      id: repository.id,
      name: repository.name,
      fullName: repository.full_name,
      private: repository.private,
      defaultBranch: repository.default_branch,
      url: repository.html_url,
    }));
  }

  async function createRepository(agentId: string, input: {
    name: string;
    description?: string;
    private?: boolean;
    autoInit?: boolean;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const response = await octokit.request('POST /orgs/{org}/repos', {
      org: config.organization,
      name: input.name,
      description: input.description,
      private: input.private ?? true,
      auto_init: input.autoInit ?? false,
    });

    return {
      id: response.data.id,
      name: response.data.name,
      fullName: response.data.full_name,
      private: response.data.private,
      defaultBranch: response.data.default_branch,
      url: response.data.html_url,
    };
  }

  async function getRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('GET /repos/{owner}/{repo}', {
      owner,
      repo: input.repositoryName,
    });

    return {
      id: response.data.id,
      name: response.data.name,
      fullName: response.data.full_name,
      private: response.data.private,
      defaultBranch: response.data.default_branch,
      url: response.data.html_url,
      cloneUrl: response.data.clone_url,
      sshUrl: response.data.ssh_url,
    };
  }

  async function listPullRequests(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    state?: 'open' | 'closed' | 'all';
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls', {
      owner,
      repo: input.repositoryName,
      state: input.state ?? 'open',
      per_page: 100,
    });

    return response.data.map((pullRequest) => ({
      number: pullRequest.number,
      title: pullRequest.title,
      state: pullRequest.state,
      url: pullRequest.html_url,
      head: pullRequest.head.ref,
      base: pullRequest.base.ref,
    }));
  }

  async function createPullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    title: string;
    head: string;
    base: string;
    body?: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('POST /repos/{owner}/{repo}/pulls', {
      owner,
      repo: input.repositoryName,
      title: input.title,
      head: input.head,
      base: input.base,
      body: input.body,
    });

    return {
      number: response.data.number,
      title: response.data.title,
      state: response.data.state,
      url: response.data.html_url,
      head: response.data.head.ref,
      base: response.data.base.ref,
    };
  }

  return {
    ensureAgentApp,
    loadAllAgents,
    unloadAgent,
    deleteAgentApp,
    getGitCredentials,
    listRepositories,
    createRepository,
    getRepository,
    listPullRequests,
    createPullRequest,
  };

  function buildProvisioning(agentId: string, credentials: GitHubAppCredentials): GitHubAppProvisioning {
    const registrationUrl = `${config.publicBaseUrl}${getRegisterPath(agentId)}`;

    if (credentials.status === 'created' || credentials.status === 'active') {
      return {
        agentId,
        status: credentials.status,
        registrationUrl,
        installUrl: `https://github.com/apps/${credentials.appSlug}/installations/new`,
      };
    }

    return {
      agentId,
      status: credentials.status,
      registrationUrl,
    };
  }

  function registerAgentRoutes(agentId: string) {
    unloadAgent(agentId);

    const cleanups = [
      config.httpServer.registerRoute({
        method: 'GET',
        path: getRegisterPath(agentId),
        handler: async () => handleRegisterPage(agentId),
      }),
      config.httpServer.registerRoute({
        method: 'GET',
        path: getManifestCallbackPath(agentId),
        handler: async (request) => handleManifestCallback(agentId, request.query.get('code'), request.query.get('state')),
      }),
      config.httpServer.registerRoute({
        method: 'GET',
        path: getSetupPath(agentId),
        handler: async (request) => handleSetupCallback(agentId, request.query.get('installation_id')),
      }),
      config.httpServer.registerRoute({
        method: 'POST',
        path: getWebhookPath(agentId),
        handler: async (request) => handleWebhook(agentId, request.headers, request.body, request.bodyText),
      }),
    ];

    routeCleanups.set(agentId, cleanups);
  }

  async function handleRegisterPage(agentId: string): Promise<HttpResponse> {
    const credentials = await getCredentials(agentId);

    if (!credentials) {
      return html(404, `<h1>GitHub App not provisioned</h1><p>No pending GitHub App configuration exists for agent ${escapeHtml(agentId)}.</p>`);
    }

    if (credentials.status !== 'pending') {
      return html(200, `<h1>GitHub App already created</h1><p>Status: ${escapeHtml(credentials.status)}</p><p><a href="${escapeHtml(buildProvisioning(agentId, credentials).installUrl ?? '#')}">Install app</a></p>`);
    }

    const manifest = JSON.stringify({
      name: credentials.appName,
      url: config.appHomeUrl,
      redirect_url: `${config.publicBaseUrl}${getManifestCallbackPath(agentId)}`,
      setup_url: `${config.publicBaseUrl}${getSetupPath(agentId)}`,
      hook_attributes: {
        url: `${config.publicBaseUrl}${getWebhookPath(agentId)}`,
        active: true,
      },
      public: false,
      default_permissions: {
        administration: 'write',
        contents: 'write',
        issues: 'write',
        metadata: 'read',
        pull_requests: 'write',
      },
      default_events: [
        'push',
        'pull_request',
        'pull_request_review',
        'issues',
        'issue_comment',
        'repository',
      ],
    });

    const action = `https://github.com/organizations/${encodeURIComponent(config.organization)}/settings/apps/new?state=${encodeURIComponent(credentials.state)}`;
    const body = `<!doctype html>
<html>
  <body>
    <form id="register-github-app" action="${escapeHtml(action)}" method="post">
      <input type="hidden" name="manifest" value="${escapeHtml(manifest)}" />
    </form>
    <p>Redirecting to GitHub App registration for agent ${escapeHtml(agentId)}...</p>
    <script>document.getElementById('register-github-app').submit();</script>
  </body>
</html>`;

    return html(200, body);
  }

  async function handleManifestCallback(agentId: string, code: string | null, state: string | null): Promise<HttpResponse> {
    const credentials = await getCredentials(agentId);

    if (!credentials || credentials.status !== 'pending') {
      return html(404, '<h1>GitHub App registration not pending</h1>');
    }

    if (!code || state !== credentials.state) {
      return html(400, '<h1>Invalid GitHub App manifest callback</h1>');
    }

    const conversionResponse = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'forge-app',
      },
    });

    if (!conversionResponse.ok) {
      const text = await conversionResponse.text();
      return html(500, `<h1>Failed to convert GitHub App manifest</h1><pre>${escapeHtml(text)}</pre>`);
    }

    const conversion = manifestConversionSchema.parse(await conversionResponse.json());
    const appOctokit = createAppOctokit({
      appId: conversion.id,
      privateKey: conversion.pem,
    });
    const appResponse = await appOctokit.request('GET /app');
    const app = appResponse.data;

    if (!app?.slug || !app.name) {
      return html(500, '<h1>GitHub App metadata is incomplete after manifest conversion</h1>');
    }

    const createdCredentials = {
      status: 'created' as const,
      appId: conversion.id,
      privateKey: conversion.pem,
      webhookSecret: conversion.webhook_secret,
      appSlug: app.slug,
      appName: app.name,
      createdAt: credentials.createdAt,
    };

    await saveCredentials(agentId, createdCredentials);

    return html(
      200,
      `<h1>GitHub App created</h1><p>Now install the app in the organization.</p><p><a href="https://github.com/apps/${escapeHtml(createdCredentials.appSlug)}/installations/new">Install ${escapeHtml(createdCredentials.appName)}</a></p>`,
    );
  }

  async function handleSetupCallback(agentId: string, installationIdValue: string | null): Promise<HttpResponse> {
    const credentials = await getCredentials(agentId);

    if (!credentials || credentials.status !== 'created') {
      return html(404, '<h1>GitHub App not ready for installation</h1>');
    }

    if (!installationIdValue) {
      return html(400, '<h1>Missing installation_id</h1>');
    }

    const installationId = Number.parseInt(installationIdValue, 10);

    if (!Number.isInteger(installationId)) {
      return html(400, '<h1>Invalid installation_id</h1>');
    }

    const octokit = createInstallationOctokit({
      ...credentials,
      installationId,
      status: 'active',
    });
    await octokit.request('GET /installation');

    const activeCredentials = {
      status: 'active' as const,
      appId: credentials.appId,
      privateKey: credentials.privateKey,
      webhookSecret: credentials.webhookSecret,
      installationId,
      appSlug: credentials.appSlug,
      appName: credentials.appName,
      createdAt: credentials.createdAt,
    };

    await saveCredentials(agentId, activeCredentials);
    await notifications.createNotification({
      agentId,
      content: JSON.stringify({
        source: 'github',
        type: 'github-app-installed',
        appSlug: activeCredentials.appSlug,
        installationId,
        organization: config.organization,
      }),
    });
    config.notifyAgent(agentId);

    return html(200, '<h1>GitHub App installed successfully</h1><p>The agent is now connected to GitHub.</p>');
  }

  async function handleWebhook(
    agentId: string,
    headers: Record<string, string | string[] | undefined>,
    body: Buffer,
    bodyText: string,
  ): Promise<HttpResponse> {
    const credentials = await getCredentials(agentId);

    if (!credentials || credentials.status !== 'active') {
      return { status: 404, body: 'GitHub App not active for agent' };
    }

    const signature = getHeader(headers, 'x-hub-signature-256');
    const event = getHeader(headers, 'x-github-event');
    const deliveryId = getHeader(headers, 'x-github-delivery');

    if (!signature || !verifyWebhook(body, credentials.webhookSecret, signature)) {
      return { status: 401, body: 'Invalid signature' };
    }

    if (!event) {
      return { status: 400, body: 'Missing GitHub event header' };
    }

    const payload = bodyText ? JSON.parse(bodyText) : {};
    await notifications.createNotification({
      agentId,
      content: JSON.stringify({
        source: 'github',
        deliveryId,
        event,
        action: typeof payload.action === 'string' ? payload.action : undefined,
        repository: payload.repository?.full_name,
        sender: payload.sender?.login,
        payload,
      }),
    });
    config.notifyAgent(agentId);

    return { status: 202, body: 'Accepted' };
  }

  async function getCredentials(agentId: string) {
    const provider = await config.db.query.agentProviders.findFirst({
      where: and(eq(agentProviders.agentId, agentId), eq(agentProviders.providerType, GITHUB_PROVIDER_TYPE)),
    });

    if (!provider) {
      return null;
    }

    return parseCredentials(provider.encryptedCredentials);
  }

  async function getActiveCredentials(agentId: string) {
    const credentials = await getCredentials(agentId);

    if (!credentials || credentials.status !== 'active') {
      throw new Error(`GitHub App not active for agent ${agentId}`);
    }

    return credentials;
  }

  async function saveCredentials(agentId: string, credentials: GitHubAppCredentials) {
    const existing = await config.db.query.agentProviders.findFirst({
      where: and(eq(agentProviders.agentId, agentId), eq(agentProviders.providerType, GITHUB_PROVIDER_TYPE)),
    });
    const encryptedCredentials = encryptSecret(JSON.stringify(credentials));

    if (existing) {
      await config.db
        .update(agentProviders)
        .set({ encryptedCredentials })
        .where(eq(agentProviders.id, existing.id));
      return;
    }

    const providerRecord: NewAgentProvider = {
      id: createId(),
      agentId,
      providerType: GITHUB_PROVIDER_TYPE,
      encryptedCredentials,
      createdAt: Date.now(),
    };

    await config.db.insert(agentProviders).values(providerRecord);
  }

  function parseCredentials(encryptedCredentials: string) {
    try {
      return githubAppCredentialsSchema.parse(JSON.parse(decryptSecret(encryptedCredentials)));
    } catch (error) {
      console.warn('[GitHubAppManager] Failed to parse GitHub credentials:', error);
      return null;
    }
  }

  async function getInstallationOctokit(agentId: string) {
    const credentials = await getActiveCredentials(agentId);
    return createInstallationOctokit(credentials);
  }

  async function getInstallationToken(credentials: Extract<GitHubAppCredentials, { status: 'active' }>) {
    const auth = createAppAuth({
      appId: credentials.appId,
      privateKey: credentials.privateKey,
      installationId: credentials.installationId,
    });
    const token = await auth({ type: 'installation' });

    return {
      token: token.token,
      expiresAt: token.expiresAt,
    };
  }

  function createAppOctokit(input: { appId: number; privateKey: string }) {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: input.appId,
        privateKey: input.privateKey,
      },
    });
  }

  function createInstallationOctokit(credentials: Extract<GitHubAppCredentials, { status: 'active' }>) {
    return new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: credentials.appId,
        privateKey: credentials.privateKey,
        installationId: credentials.installationId,
      },
    });
  }
}

function createAppName(agentName: string, agentId: string) {
  return `${agentName} (${agentId})`;
}

function getRegisterPath(agentId: string) {
  return `/github/apps/${encodeURIComponent(agentId)}/register`;
}

function getManifestCallbackPath(agentId: string) {
  return `/github/apps/${encodeURIComponent(agentId)}/manifest/callback`;
}

function getSetupPath(agentId: string) {
  return `/github/apps/${encodeURIComponent(agentId)}/setup`;
}

function getWebhookPath(agentId: string) {
  return `/webhooks/github/${encodeURIComponent(agentId)}`;
}

function getHeader(headers: Record<string, string | string[] | undefined>, name: string) {
  const value = headers[name];

  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

function verifyWebhook(body: Buffer, secret: string, signature: string) {
  const digest = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function html(status: number, body: string): HttpResponse {
  return {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
    },
    body,
  };
}
