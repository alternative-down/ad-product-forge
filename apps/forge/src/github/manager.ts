import { createId } from '../utils/id';
import { nanoid } from 'nanoid';
import { createAppAuth } from '@octokit/auth-app';
import { App, Octokit } from 'octokit';
import { and, eq } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import { z } from 'zod';

import type { Database } from '../database/index';
import type { createSystemIntegrationStore } from '../system-integrations/store';
import { agentProviders, agents, type NewAgentProvider } from '../database/schema';
import { decryptSecret, encryptSecret } from '../encryption/crypto';
import type { createForgeHttpServer, HttpResponse } from '../http/server';
import { createAgentNotificationStore } from '../notifications/store';
import {
  githubAppCredentialsSchema,
  githubAppManifestConfigSchema,
  type GitHubAppCredentials,
  type GitHubAppManifestConfig,
} from './types';

import {
  buildManifestEvents,
  buildManifestPermissions,
  createAppName,
  createGitHubInstallWakeContent,
  createGitHubWebhookWakeContent,
  isGitHubSelfEvent,
  isRecord,
  normalizeAssignees,
  normalizeGitHubAppCredentials,
  normalizeManifestConfig,
  summarizeGitHubEvent,
  toIssueDetails,
  toIssueSummary,
  getHeader,
  getManifestCallbackPath,
  getRegisterPath,
  getSetupPath,
  getWebhookPath,
  escapeHtml,
  DEFAULT_GITHUB_APP_MANIFEST_CONFIG,
} from './helpers';
import { createReposOps } from './ops/repos.js';
import { createPullRequestsOps } from './ops/pull-requests.js';
import { createIssuesOps } from './ops/issues.js';
import { createLabelsOps } from './ops/labels.js';
import { createMilestonesOps } from './ops/milestones.js';
import { createRoutingOps } from './ops/routing.js';
import { createAppProvisioningOps } from './apps.js';
import { createCredentialsOps } from './ops/credentials.js';
import type { OpsContext } from './ops/context.js';


const GITHUB_PROVIDER_TYPE = 'github-app';
const INSTALLATION_READY_ATTEMPTS = 10;
const INSTALLATION_READY_DELAY_MS = 1500;

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
  manifestConfig: GitHubAppManifestConfig;
};

export type GitHubAppManager = ReturnType<typeof createGitHubAppManager>;

export function createGitHubAppManager(config: {
  db: Database;
  httpServer: ReturnType<typeof createForgeHttpServer>;
  publicBaseUrl: string;
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}) {
  const notifications = createAgentNotificationStore(config.db);
  const routeCleanups = new Map<string, Array<() => void>>();
  // opsRouting proxy: declared before opsCtx to avoid TDZ; populated after instantiation
  const opsRouting: ReturnType<typeof createRoutingOps> = {} as never;

  // ── Build shared ops context ───────────────────────────────────────────────
  const opsCtx: OpsContext = {
    config,
    notifications,
    routeCleanups,
    GITHUB_PROVIDER_TYPE,
    and,
    eq,
    agentProviders,
    agents,
    createId,
    nanoid,
    forgeDebug,
    getGlobalConfig,
    getDefaultOwner,
    getInstallationOctokit,
    getInstallationToken,
    getCredentials,
    getActiveCredentials,
    saveCredentials,
    parseCredentials,
    createInstallationOctokit,
    getHeader,
    getRegisterPath,
    getManifestCallbackPath,
    getSetupPath,
    getWebhookPath,
    escapeHtml,
    normalizeAssignees,
    toIssueSummary: (p) => toIssueSummary(p as Parameters<typeof toIssueSummary>[0]) as never,
    toIssueDetails: (p) => toIssueDetails(p as Parameters<typeof toIssueDetails>[0]) as never,
    DEFAULT_GITHUB_APP_MANIFEST_CONFIG,
    buildManifestEvents,
    buildManifestPermissions,
    createAppName,
    createGitHubInstallWakeContent,
    createGitHubWebhookWakeContent,
    isGitHubSelfEvent,
    isRecord,
    summarizeGitHubEvent,
    normalizeGitHubAppCredentials: (r) => normalizeGitHubAppCredentials(r as Parameters<typeof normalizeGitHubAppCredentials>[0]) as never,
    normalizeManifestConfig: (r) => normalizeManifestConfig(r as Parameters<typeof normalizeManifestConfig>[0]) as never,
    opsRouting,
  };

  // ── Instantiate ops modules ─────────────────────────────────────────────
  const opsCredentials = createCredentialsOps(opsCtx);
  const opsRepos = createReposOps(opsCtx);
  const opsPullRequests = createPullRequestsOps(opsCtx);
  const opsIssues = createIssuesOps(opsCtx);
  const opsLabels = createLabelsOps(opsCtx);
  const opsMilestones = createMilestonesOps(opsCtx);
  const _routingOps = createRoutingOps(opsCtx);
  const opsApps = createAppProvisioningOps(opsCtx);

  // Populate opsRouting proxy after all modules are initialized (avoids TDZ)
  Object.assign(opsRouting, _routingOps);

  // ── App Lifecycle ────────────────────────────────────────────────────────
  async function getGlobalConfig() {
    const githubConfig = await config.integrations.getGitHubConfig();

    if (!githubConfig) {
      throw new Error('GitHub integration is not configured');
    }

    return githubConfig;
  }

  async function isConfigured() {
    return Boolean(await config.integrations.getGitHubConfig());
  }

  async function getDefaultOwner(owner?: string) {
    if (owner) {
      return owner;
    }

    const githubConfig = await getGlobalConfig();
    return githubConfig.organization;
  }

  async function createAgentApp(input: { agentId: string; agentName: string }) {
    await getGlobalConfig();
    const existing = await getCredentials(input.agentId);

    if (existing) {
      throw new Error(`GitHub App already exists for agent ${input.agentId}`);
    }

    const pendingCredentials = {
      status: 'pending' as const,
      state: createId(),
      appName: createAppName(input.agentName, input.agentId),
      manifestConfig: DEFAULT_GITHUB_APP_MANIFEST_CONFIG,
      createdAt: Date.now(),
    };

    await saveCredentials(input.agentId, pendingCredentials);
    opsRouting.registerAgentRoutes(input.agentId);
    return opsRouting.buildProvisioning(input.agentId, pendingCredentials);
  }

  async function getAgentProvisioning(agentId: string) {
    const credentials = await getCredentials(agentId);

    if (credentials) {
      return opsRouting.buildProvisioning(agentId, credentials);
    }

    if (!(await isConfigured())) {
      return null;
    }

    const agent = await config.db.query.agents.findFirst({
      where: eq(agents.id, agentId),
    });

    if (!agent) {
      return null;
    }

    return createAgentApp({
      agentId,
      agentName: agent.name,
    });
  }

  async function updateAgentManifestConfig(input: {
    agentId: string;
    manifestConfig: GitHubAppManifestConfig;
  }) {
    const credentials = await getCredentials(input.agentId);
    const manifestConfig = githubAppManifestConfigSchema.parse(input.manifestConfig);

    if (!credentials) {
      throw new Error(`GitHub App does not exist for agent ${input.agentId}`);
    }

    const nextCredentials = {
      ...credentials,
      manifestConfig,
    } satisfies GitHubAppCredentials;

    await saveCredentials(input.agentId, nextCredentials);
    return opsRouting.buildProvisioning(input.agentId, nextCredentials);
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

      opsRouting.registerAgentRoutes(providerRow.agentId);
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
    const githubConfig = await getGlobalConfig();
    const credentials = await getActiveCredentials(input.agentId);
    const token = await getInstallationToken(credentials);

    return {
      username: 'x-access-token',
      token: token.token,
      expiresAt: token.expiresAt,
      repositoryUrl: input.repositoryName
        ? `https://github.com/${githubConfig.organization}/${input.repositoryName}.git`
        : undefined,
      gitUserName: credentials.appName,
      gitUserEmail: `${credentials.appSlug}@forge.github-app.local`,
    };
  }

// === Repo Ops ===
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
    defaultBranch?: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const githubConfig = await getGlobalConfig();
    const response = await octokit.request('POST /orgs/{org}/repos', {
      org: githubConfig.organization,
      name: input.name,
      description: input.description,
      private: input.private ?? true,
      auto_init: input.autoInit ?? false,
      ...(input.defaultBranch && { default_branch: input.defaultBranch }),
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

  async function updateRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    name?: string;
    description?: string;
    private?: boolean;
    defaultBranch?: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('PATCH /repos/{owner}/{repo}', {
      owner,
      repo: input.repositoryName,
      name: input.name,
      description: input.description,
      private: input.private,
      default_branch: input.defaultBranch,
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

  async function deleteRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    await octokit.request('DELETE /repos/{owner}/{repo}', {
      owner,
      repo: input.repositoryName,
    });

    return {
      success: true,
    };
  }

  async function getRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
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
    const owner = await getDefaultOwner(input.owner);
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
    const owner = await getDefaultOwner(input.owner);
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

  async function getPullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner,
      repo: input.repositoryName,
      pull_number: input.pullRequestNumber,
    });

    return {
      number: response.data.number,
      title: response.data.title,
      state: response.data.state,
      url: response.data.html_url,
      head: response.data.head.ref,
      base: response.data.base.ref,
      body: response.data.body ?? null,
      merged: response.data.merged,
      draft: response.data.draft ?? false,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
    };
  }

  async function listPullRequestComments(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
    direction?: 'asc' | 'desc';
    limit?: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}/comments', {
      owner,
      repo: input.repositoryName,
      pull_number: input.pullRequestNumber,
      direction: input.direction ?? 'asc',
      per_page: Math.min(input.limit ?? 100, 100),
    });

    return response.data.map((comment) => ({
      id: comment.id,
      body: comment.body,
      user: comment.user?.login ?? null,
      createdAt: comment.created_at,
      updatedAt: comment.updated_at,
    }));
  }

  async function updatePullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
    title?: string;
    body?: string;
    base?: string;
    state?: 'open' | 'closed';
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('PATCH /repos/{owner}/{repo}/pulls/{pull_number}', {
      owner,
      repo: input.repositoryName,
      pull_number: input.pullRequestNumber,
      title: input.title,
      body: input.body,
      base: input.base,
      state: input.state,
    });

    return {
      number: response.data.number,
      title: response.data.title,
      state: response.data.state,
      url: response.data.html_url,
      head: response.data.head.ref,
      base: response.data.base.ref,
      body: response.data.body ?? null,
      merged: response.data.merged,
      draft: response.data.draft ?? false,
      createdAt: response.data.created_at,
      updatedAt: response.data.updated_at,
    };
  }

  async function mergePullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
    mergeMethod?: 'merge' | 'squash' | 'rebase';
    commitTitle?: string;
    commitMessage?: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', {
      owner,
      repo: input.repositoryName,
      pull_number: input.pullRequestNumber,
      merge_method: input.mergeMethod ?? 'merge',
      commit_title: input.commitTitle,
      commit_message: input.commitMessage,
    });

    return {
      merged: response.data.merged,
      message: response.data.message,
      sha: response.data.sha,
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
    const owner = await getDefaultOwner(input.owner);
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
      .map((issue) => toIssueSummary(issue as unknown as Parameters<typeof toIssueSummary>[0]));
  }

  async function getIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('GET /repos/{owner}/{repo}/issues/{issue_number}', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
    });

    return toIssueDetails(response.data as unknown as Parameters<typeof toIssueDetails>[0]);
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
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('POST /repos/{owner}/{repo}/issues', {
      owner,
      repo: input.repositoryName,
      title: input.title,
      body: input.body,
      labels: input.labels,
      assignees: normalizeAssignees(input.assignees),
      milestone: input.milestone,
    });

    return toIssueDetails(response.data as unknown as Parameters<typeof toIssueDetails>[0]);
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
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('PATCH /repos/{owner}/{repo}/issues/{issue_number}', {
      owner,
      repo: input.repositoryName,
      issue_number: input.issueNumber,
      title: input.title,
      body: input.body,
      state: input.state,
      labels: input.labels,
      assignees: normalizeAssignees(input.assignees),
      milestone: input.milestone,
    });

    return toIssueDetails(response.data as unknown as Parameters<typeof toIssueDetails>[0]);
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
    const owner = await getDefaultOwner(input.owner);
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

  async function getIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    commentId: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('GET /repos/{owner}/{repo}/issues/comments/{comment_id}', {
      owner,
      repo: input.repositoryName,
      comment_id: input.commentId,
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

  async function createIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    body: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
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

  async function updateIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    commentId: number;
    body: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}', {
      owner,
      repo: input.repositoryName,
      comment_id: input.commentId,
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

  async function deleteIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    commentId: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    await octokit.request('DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}', {
      owner,
      repo: input.repositoryName,
      comment_id: input.commentId,
    });

    return {
      success: true,
    };
  }

  async function listLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    limit?: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
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

  async function createLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
    color: string;
    description?: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('POST /repos/{owner}/{repo}/labels', {
      owner,
      repo: input.repositoryName,
      name: input.labelName,
      color: input.color,
      description: input.description,
    });

    return {
      name: response.data.name,
      description: response.data.description ?? null,
      color: response.data.color,
      default: response.data.default,
    };
  }

  async function updateLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
    newLabelName?: string;
    color?: string;
    description?: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('PATCH /repos/{owner}/{repo}/labels/{name}', {
      owner,
      repo: input.repositoryName,
      name: input.labelName,
      new_name: input.newLabelName,
      color: input.color,
      description: input.description,
    });

    return {
      name: response.data.name,
      description: response.data.description ?? null,
      color: response.data.color,
      default: response.data.default,
    };
  }

  async function deleteLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    await octokit.request('DELETE /repos/{owner}/{repo}/labels/{name}', {
      owner,
      repo: input.repositoryName,
      name: input.labelName,
    });

    return {
      success: true,
    };
  }

  async function addIssueLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    labels: string[];
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
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
    const owner = await getDefaultOwner(input.owner);

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
    const owner = await getDefaultOwner(input.owner);
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

  async function createMilestone(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    title: string;
    description?: string;
    state?: 'open' | 'closed';
    dueOn?: string;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('POST /repos/{owner}/{repo}/milestones', {
      owner,
      repo: input.repositoryName,
      title: input.title,
      description: input.description,
      state: input.state,
      due_on: input.dueOn ?? undefined,
    });

    return {
      number: response.data.number,
      title: response.data.title,
      description: response.data.description ?? null,
      state: response.data.state,
      dueOn: response.data.due_on,
      openIssues: response.data.open_issues,
      closedIssues: response.data.closed_issues,
    };
  }

  async function updateMilestone(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    milestoneNumber: number;
    title?: string;
    description?: string;
    state?: 'open' | 'closed';
    dueOn?: string | null;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    const response = await octokit.request('PATCH /repos/{owner}/{repo}/milestones/{milestone_number}', {
      owner,
      repo: input.repositoryName,
      milestone_number: input.milestoneNumber,
      title: input.title,
      description: input.description,
      state: input.state,
      due_on: input.dueOn ?? undefined,
    });

    return {
      number: response.data.number,
      title: response.data.title,
      description: response.data.description ?? null,
      state: response.data.state,
      dueOn: response.data.due_on,
      openIssues: response.data.open_issues,
      closedIssues: response.data.closed_issues,
    };
  }

  async function deleteMilestone(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    milestoneNumber: number;
  }) {
    const octokit = await getInstallationOctokit(agentId);
    const owner = await getDefaultOwner(input.owner);
    await octokit.request('DELETE /repos/{owner}/{repo}/milestones/{milestone_number}', {
      owner,
      repo: input.repositoryName,
      milestone_number: input.milestoneNumber,
    });

    return {
      success: true,
    };
  }

  return {
    isConfigured,
    getAgentProvisioning,
    updateAgentManifestConfig,
    createAgentApp,
    loadAllAgents,
    unloadAgent,
    deleteAgentApp,
    getGitCredentials,
    listRepositories,
    createRepository,
    updateRepository,
    deleteRepository,
    getRepository,
    listPullRequests,
    createPullRequest,
    getPullRequest,
    updatePullRequest,
    mergePullRequest,
    listPullRequestComments,
    listIssues,
    getIssue,
    createIssue,
    updateIssue,
    closeIssue,
    reopenIssue,
    listIssueComments,
    getIssueComment,
    createIssueComment,
    updateIssueComment,
    deleteIssueComment,
    listLabels,
    createLabel,
    updateLabel,
    deleteLabel,
    addIssueLabels,
    removeIssueLabels,
    listMilestones,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    handleRegisterPage: opsRouting.handleRegisterPage,
    handleManifestCallback: opsRouting.handleManifestCallback,
    handleSetupCallback: opsRouting.handleSetupCallback,
    handleWebhook: opsRouting.handleWebhook,
  };


// === Credentials ===
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
      const raw = JSON.parse(decryptSecret(encryptedCredentials)) as Record<string, unknown>;
      return githubAppCredentialsSchema.parse(normalizeGitHubAppCredentials(raw as never));
    } catch (error) {
      forgeDebug('github-manager', 'Failed to parse GitHub credentials', { error });
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
