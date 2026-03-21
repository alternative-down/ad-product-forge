import crypto from 'node:crypto';

import { createId } from '@paralleldrive/cuid2';
import { createAppAuth } from '@octokit/auth-app';
import { App, Octokit } from 'octokit';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { Database } from '../database/index.js';
import { agentProviders, type NewAgentProvider } from '../database/schema.js';
import { decryptSecret, encryptSecret } from '../encryption/crypto.js';
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

  async function createAgentApp(input: { agentId: string; agentName: string }) {
    const existing = await getCredentials(input.agentId);

    if (existing) {
      throw new Error(`GitHub App already exists for agent ${input.agentId}`);
    }

    const pendingCredentials = {
      status: 'pending' as const,
      state: crypto.randomUUID(),
      appName: createAppName(input.agentName, input.agentId),
      createdAt: Date.now(),
    };

    await saveCredentials(input.agentId, pendingCredentials);
    registerAgentRoutes(input.agentId);
    return buildProvisioning(input.agentId, pendingCredentials);
  }

  async function loadAllAgents() {
    const providerRows = await config.db.query.agentProviders.findMany({
      where: eq(agentProviders.providerType, GITHUB_PROVIDER_TYPE),
    });

    for (const providerRow of providerRows) {
      const credentials = parseCredentials(providerRow.encryptedCredentials);

      if (!credentials) {
        continue;
      }

      registerAgentRoutes(providerRow.agentId);
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

    if (!credentials || credentials.status !== 'active') {
      return;
    }

    const app = createGitHubApp(credentials);
    await app.octokit.request('DELETE /app/installations/{installation_id}', {
      installation_id: credentials.installationId,
    });
  }

  async function getGitCredentials(input: {
    agentId: string;
    repositoryName?: string;
  }) {
    const credentials = await getActiveCredentials(input.agentId);
    const token = await getInstallationToken(credentials);

    return {
      username: 'x-access-token',
      token: token.token,
      expiresAt: token.expiresAt,
      repositoryUrl: input.repositoryName
        ? `https://github.com/${config.organization}/${input.repositoryName}.git`
        : undefined,
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

  async function listIssues(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    state?: 'open' | 'closed' | 'all';
    labels?: string[];
    assignee?: string;
    creator?: string;
    sort?: 'created' | 'updated' | 'comments';
    direction?: 'asc' | 'desc';
    limit?: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('GET /repos/{owner}/{repo}/issues', {
      owner,
      repo: input.repositoryName,
      state: input.state ?? 'open',
      labels: input.labels?.join(','),
      assignee: input.assignee,
      creator: input.creator,
      sort: input.sort,
      direction: input.direction,
      per_page: Math.min(input.limit ?? 50, 100),
    });

    return response.data
      .filter((issue) => !('pull_request' in issue))
      .map((issue) => toIssueSummary(issue));
  }

  async function getIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
    });

    return toIssueDetails(response.data);
  }

  async function createIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    title: string;
    body?: string;
    labels?: string[];
    assignees?: string[];
    milestone?: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('POST /repos/{owner}/{repo}/issues', {
      owner,
      repo: input.repositoryName,
      title: input.title,
      body: input.body,
      labels: input.labels,
      assignees: input.assignees,
      milestone: input.milestone,
    });

    return toIssueDetails(response.data);
  }

  async function updateIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    title?: string;
    body?: string;
    state?: 'open' | 'closed';
    labels?: string[];
    assignees?: string[];
    milestone?: number | null;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
      title: input.title,
      body: input.body,
      state: input.state,
      labels: input.labels,
      assignees: input.assignees,
      milestone: input.milestone,
    });

    return toIssueDetails(response.data);
  }

  async function closeIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    return updateIssue(agentId, {
      ...input,
      state: 'closed',
    });
  }

  async function reopenIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    return updateIssue(agentId, {
      ...input,
      state: 'open',
    });
  }

  async function listIssueComments(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    limit?: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
      per_page: Math.min(input.limit ?? 100, 100),
    });

    return response.data.map((comment) => ({
      id: comment.id,
      url: comment.html_url,
      body: comment.body ?? '',
      author: comment.user?.login ?? null,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
    }));
  }

  async function createIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    body: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/comments', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
      body: input.body,
    });

    return {
      id: response.data.id,
      url: response.data.html_url,
      body: response.data.body ?? '',
      author: response.data.user?.login ?? null,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
    };
  }

  async function listLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    limit?: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('GET /repos/{owner}/{repo}/labels', {
      owner,
      repo: input.repositoryName,
      per_page: Math.min(input.limit ?? 100, 100),
    });

    return response.data.map((label) => ({
      name: label.name,
      description: label.description ?? null,
      color: label.color,
      default: label.default,
    }));
  }

  async function addIssueLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    labels: string[];
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('POST /repos/{owner}/{repo}/issues/{issue_number}/labels', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
      labels: input.labels,
    });

    return response.data.map((label) => ({
      name: label.name,
      description: label.description ?? null,
      color: label.color,
      default: label.default,
    }));
  }

  async function removeIssueLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    labels: string[];
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;

    for (const labelName of input.labels) {
      await octokit.request('DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels/{name}', {
        owner,
        repo: input.repositoryName,
        issue_number: input.issueNumber,
        name: labelName,
      }).catch((error) => {
        if (
          typeof error === 'object'
          && error !== null
          && 'status' in error
          && error.status === 404
        ) {
          return;
        }

        throw error;
      });
    }

    const response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}/labels', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
    });

    return response.data.map((label) => ({
      name: label.name,
      description: label.description ?? null,
      color: label.color,
      default: label.default,
    }));
  }

  async function listMilestones(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    state?: 'open' | 'closed' | 'all';
    limit?: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = input.owner ?? config.organization;
    const response = await octokit.request('GET /repos/{owner}/{repo}/milestones', {
      owner,
      repo: input.repositoryName,
      state: input.state ?? 'open',
      per_page: Math.min(input.limit ?? 100, 100),
    });

    return response.data.map((milestone) => ({
      number: milestone.number,
      title: milestone.title,
      description: milestone.description ?? null,
      state: milestone.state,
      dueOn: milestone.due_on,
      openIssues: milestone.open_issues,
      closedIssues: milestone.closed_issues,
    }));
  }

  return {
    createAgentApp,
    loadAllAgents,
    unloadAgent,
    deleteAgentApp,
    getGitCredentials,
    listRepositories,
    createRepository,
    getRepository,
    listPullRequests,
    createPullRequest,
    listIssues,
    getIssue,
    createIssue,
    updateIssue,
    closeIssue,
    reopenIssue,
    listIssueComments,
    createIssueComment,
    listLabels,
    addIssueLabels,
    removeIssueLabels,
    listMilestones,
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
        handler: async (request) => handleWebhook(agentId, request.headers, request.bodyText),
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
      return html(
        200,
        `<h1>GitHub App already created</h1><p>Status: ${escapeHtml(credentials.status)}</p><p><a href="${escapeHtml(buildProvisioning(agentId, credentials).installUrl ?? '#')}">Install app</a></p>`,
      );
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

    const anonymousOctokit = new Octokit({
      userAgent: 'forge-app',
    });

    let conversion;

    try {
      const response = await anonymousOctokit.request('POST /app-manifests/{code}/conversions', {
        code,
      });
      conversion = manifestConversionSchema.parse(response.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return html(500, `<h1>Failed to convert GitHub App manifest</h1><pre>${escapeHtml(message)}</pre>`);
    }
    const app = createGitHubApp({
      status: 'created',
      appId: conversion.id,
      privateKey: conversion.pem,
      webhookSecret: conversion.webhook_secret,
      appSlug: 'pending-slug',
      appName: credentials.appName,
      createdAt: credentials.createdAt,
    });
    const appResponse = await app.octokit.request('GET /app');
    const metadata = appResponse.data;

    if (!metadata?.slug || !metadata.name) {
      return html(500, '<h1>GitHub App metadata is incomplete after manifest conversion</h1>');
    }

    const createdCredentials = {
      status: 'created' as const,
      appId: conversion.id,
      privateKey: conversion.pem,
      webhookSecret: conversion.webhook_secret,
      appSlug: metadata.slug,
      appName: metadata.name,
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

    const octokit = await createInstallationOctokit({
      ...credentials,
      status: 'active',
      installationId,
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
      content: `GitHub App ${activeCredentials.appSlug} installed in organization ${config.organization}.`,
    });
    config.notifyAgent(agentId);

    return html(200, '<h1>GitHub App installed successfully</h1><p>The agent is now connected to GitHub.</p>');
  }

  async function handleWebhook(
    agentId: string,
    headers: Record<string, string | string[] | undefined>,
    payload: string,
  ): Promise<HttpResponse> {
    const credentials = await getCredentials(agentId);

    if (!credentials || credentials.status !== 'active') {
      return { status: 404, body: 'GitHub App not active for agent' };
    }

    const deliveryId = getHeader(headers, 'x-github-delivery');
    const eventName = getHeader(headers, 'x-github-event');
    const signature = getHeader(headers, 'x-hub-signature-256');

    if (!deliveryId || !eventName || !signature) {
      return { status: 400, body: 'Missing GitHub webhook headers' };
    }

    const app = createGitHubApp(credentials);
    app.webhooks.onAny(async ({ name, payload }) => {
      const payloadRecord = payload as Record<string, unknown>;
      const repository =
        typeof payloadRecord.repository === 'object' && payloadRecord.repository && 'full_name' in payloadRecord.repository
          ? (typeof payloadRecord.repository.full_name === 'string' ? payloadRecord.repository.full_name : undefined)
          : undefined;
      const sender =
        typeof payloadRecord.sender === 'object' && payloadRecord.sender && 'login' in payloadRecord.sender
          ? (typeof payloadRecord.sender.login === 'string' ? payloadRecord.sender.login : undefined)
          : undefined;
      const action = typeof payloadRecord.action === 'string' ? payloadRecord.action : undefined;
      const content = summarizeGitHubEvent({
        event: name,
        action,
        repository,
        sender,
        payload,
      });

      await notifications.createNotification({
        agentId,
        content,
      });
      config.notifyAgent(agentId);
    });

    await app.webhooks.verifyAndReceive({
      id: deliveryId,
      name: eventName,
      signature,
      payload,
    });

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

  function createGitHubApp(credentials: Extract<GitHubAppCredentials, { status: 'created' | 'active' }>) {
    return new App({
      appId: credentials.appId,
      privateKey: credentials.privateKey,
      webhooks: {
        secret: credentials.webhookSecret,
      },
    });
  }

  async function createInstallationOctokit(credentials: Extract<GitHubAppCredentials, { status: 'active' }>) {
    const app = createGitHubApp(credentials);
    return app.getInstallationOctokit(credentials.installationId);
  }
}

type GitHubIssueLabel = string | {
  name?: string | null;
};

type GitHubIssueLike = {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  html_url: string;
  labels: GitHubIssueLabel[];
  assignees?: Array<{ login: string }> | null;
  milestone?: { number: number; title: string } | null;
  comments?: number;
  created_at: string;
  updated_at: string;
};

function toIssueSummary(issue: GitHubIssueLike) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
    labels: issue.labels.map((label) => typeof label === 'string' ? label : label.name),
    assignees: issue.assignees?.map((assignee) => assignee.login) ?? [],
    milestone: issue.milestone?.title ?? null,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  };
}

function toIssueDetails(issue: GitHubIssueLike) {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    state: issue.state,
    url: issue.html_url,
    labels: issue.labels.map((label) => typeof label === 'string' ? label : label.name),
    assignees: issue.assignees?.map((assignee) => assignee.login) ?? [],
    milestone: issue.milestone
      ? {
        number: issue.milestone.number,
        title: issue.milestone.title,
      }
      : null,
    comments: 'comments' in issue ? issue.comments : 0,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  };
}

function summarizeGitHubEvent(input: {
  event: string;
  action?: string;
  repository?: string;
  sender?: string;
  payload: unknown;
}) {
  const payloadRecord = isRecord(input.payload) ? input.payload : {};
  const issue = isRecord(payloadRecord.issue) ? payloadRecord.issue : null;
  const pullRequest = isRecord(payloadRecord.pull_request) ? payloadRecord.pull_request : null;
  const review = isRecord(payloadRecord.review) ? payloadRecord.review : null;
  const actionText = input.action ? ` ${input.action}` : '';
  const repositoryText = input.repository ? ` in ${input.repository}` : '';
  const senderText = input.sender ? ` by ${input.sender}` : '';

  if (input.event === 'issues' && issue) {
    const number = typeof issue.number === 'number' ? issue.number : null;
    const title = typeof issue.title === 'string' ? issue.title : null;
    return `Issue${actionText}${repositoryText}: #${number ?? '?'}${title ? ` ${title}` : ''}${senderText}`.trim();
  }

  if (input.event === 'issue_comment' && issue) {
    const number = typeof issue.number === 'number' ? issue.number : null;
    const title = typeof issue.title === 'string' ? issue.title : null;
    return `Issue comment${actionText}${repositoryText}: #${number ?? '?'}${title ? ` ${title}` : ''}${senderText}`.trim();
  }

  if (input.event === 'pull_request' && pullRequest) {
    const number = typeof pullRequest.number === 'number' ? pullRequest.number : null;
    const title = typeof pullRequest.title === 'string' ? pullRequest.title : null;
    return `Pull request${actionText}${repositoryText}: #${number ?? '?'}${title ? ` ${title}` : ''}${senderText}`.trim();
  }

  if (input.event === 'pull_request_review' && pullRequest) {
    const number = typeof pullRequest.number === 'number' ? pullRequest.number : null;
    const title = typeof pullRequest.title === 'string' ? pullRequest.title : null;
    const reviewState = review && typeof review.state === 'string' ? ` (${review.state.toLowerCase()})` : '';
    return `Pull request review${actionText}${repositoryText}: #${number ?? '?'}${title ? ` ${title}` : ''}${reviewState}${senderText}`.trim();
  }

  if (input.event === 'push') {
    const ref = typeof payloadRecord.ref === 'string' ? payloadRecord.ref.replace('refs/heads/', '') : null;
    return `Push${repositoryText}${ref ? ` on ${ref}` : ''}${senderText}`.trim();
  }

  if (input.event === 'repository') {
    return `Repository event${actionText}${repositoryText}${senderText}`.trim();
  }

  return `GitHub event ${input.event}${actionText}${repositoryText}${senderText}`.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
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
