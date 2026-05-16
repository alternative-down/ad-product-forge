import { createId } from '../utils/id';
import { nanoid } from 'nanoid';
import { createAppAuth } from '@octokit/auth-app';
import { App, Octokit } from 'octokit';
import { and, eq } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import { z } from 'zod';


import type {Database} from '../database/schema';
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
import { createReposOps } from './ops/repos';
import { createPullRequestsOps } from './ops/pull-requests';
import { createIssuesOps } from './ops/issues';
import { createLabelsOps } from './ops/labels';
import { createMilestonesOps } from './ops/milestones';
import { createRoutingOps } from './ops/routing';
import { createAppProvisioningOps } from './apps';
import { createCredentialsOps } from './ops/credentials';
import type { OpsContext } from './ops/context';


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

/**
 * Creates a per-agent GitHubAppManager instance.
 * Each agent gets its own isolated manager with:
 * - Fresh notifications store (agent-scoped events)
 * - Fresh routeCleanups map (no route conflicts between agents)
 * - Shared global state: db, httpServer, integrations
 *
 * Like createPerAgentCoolifyManager, the factory pattern ensures agents
 * get isolated routing namespaces while sharing the same HTTP server.
 */
export function createPerAgentGitHubManager(config: {
  db: Database;
  httpServer: ReturnType<typeof createForgeHttpServer>;
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}): GitHubAppManager {
  return createGitHubAppManager(config);
}



export function createGitHubAppManager(config: {
  db: Database;
  httpServer: ReturnType<typeof createForgeHttpServer>;
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}) {
  const notifications = createAgentNotificationStore(config.db);
  const routeCleanups = new Map<string, Array<() => void>>();
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
  };

  // ── Instantiate ops modules (opsRouting not in opsCtx to avoid circular reference) ─
  const opsRouting = createRoutingOps(opsCtx);
  const opsCredentials = createCredentialsOps(opsCtx);
  const opsRepos = createReposOps(opsCtx);
  const opsPullRequests = createPullRequestsOps(opsCtx);
  const opsIssues = createIssuesOps(opsCtx);
  const opsLabels = createLabelsOps(opsCtx);
  const opsMilestones = createMilestonesOps(opsCtx);
  const opsApps = createAppProvisioningOps(opsCtx);

  // ── App Lifecycle ────────────────────────────────────────────────────────
  async function getGlobalConfig() {
    const githubConfig = await config.integrations.getGitHubConfig();

    if (!githubConfig) {
      forgeDebug({ scope: 'github-manager', level: 'warn', message: 'GitHub integration not configured' });
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
      forgeDebug({ scope: 'github-manager', level: 'warn', message: 'GitHub App already exists for agent', context: { agentId: input?.agentId } });
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

    // eslint-disable-next-line @typescript-eslint/return-await
  return await createAgentApp({
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
      forgeDebug({ scope: 'github-manager', level: 'warn', message: 'GitHub App does not exist for agent', context: { agentId: input?.agentId } });
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
        forgeDebug({
          scope: 'github-manager',
          level: 'warn',
          message: 'loadAllAgents: skipped agent due to unparseable credentials',
          context: { agentId: providerRow.agentId },
        });
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
    return await opsRepos.listRepositories(agentId);
  }

  async function createRepository(agentId: string, input: {
    name: string;
    description?: string;
    private?: boolean;
    autoInit?: boolean;
    defaultBranch?: string;
  }) {
    return await opsRepos.createRepository(agentId, input);
  }

  async function updateRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    name?: string;
    description?: string;
    private?: boolean;
    defaultBranch?: string;
  }) {
    return await opsRepos.updateRepository(agentId, input);
  }

  async function deleteRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
  }) {
    return await opsRepos.deleteRepository(agentId, input);
  }

  async function getRepository(agentId: string, input: {
    owner?: string;
    repositoryName: string;
  }) {
    return await opsRepos.getRepository(agentId, input);
  }

  async function listPullRequests(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    state?: 'open' | 'closed' | 'all';
  }) {
    return await opsPullRequests.listPullRequests(agentId, input);
  }

  async function createPullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    title: string;
    head: string;
    base: string;
    body?: string;
  }) {
    return await opsPullRequests.createPullRequest(agentId, input);
  }

  async function getPullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
  }) {
    return await opsPullRequests.getPullRequest(agentId, input);
  }

  async function listPullRequestComments(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
    direction?: 'asc' | 'desc';
    limit?: number;
  }) {
    return await opsPullRequests.listPullRequestComments(agentId, input);
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
    return await opsPullRequests.updatePullRequest(agentId, input);
  }

  async function mergePullRequest(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    pullRequestNumber: number;
    mergeMethod?: 'merge' | 'squash' | 'rebase';
    commitTitle?: string;
    commitMessage?: string;
  }) {
    return await opsPullRequests.mergePullRequest(agentId, input);
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
    return await opsIssues.listIssues(agentId, input);
  }

  async function getIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    return await opsIssues.getIssue(agentId, input);
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
    return await opsIssues.createIssue(agentId, input);
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
    return await opsIssues.updateIssue(agentId, input);
  }

  async function closeIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    return await opsIssues.closeIssue(agentId, input);
  }

  async function reopenIssue(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
  }) {
    return await opsIssues.reopenIssue(agentId, input);
  }

  async function listIssueComments(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    limit?: number;
  }) {
    return await opsIssues.listIssueComments(agentId, input);
  }

  async function getIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    commentId: number;
  }) {
    return await opsIssues.getIssueComment(agentId, input);
  }

  async function createIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    body: string;
  }) {
    return await opsIssues.createIssueComment(agentId, input);
  }

  async function updateIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    commentId: number;
    body: string;
  }) {
    return await opsIssues.updateIssueComment(agentId, input);
  }

  async function deleteIssueComment(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    commentId: number;
  }) {
    return await opsIssues.deleteIssueComment(agentId, input);
  }

  async function listLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    limit?: number;
  }) {
    return await opsLabels.listLabels(agentId, input);
  }

  async function createLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
    color: string;
    description?: string;
  }) {
    return await opsLabels.createLabel(agentId, input);
  }

  async function updateLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
    newLabelName?: string;
    color?: string;
    description?: string;
  }) {
    return await opsLabels.updateLabel(agentId, input);
  }

  async function deleteLabel(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    labelName: string;
  }) {
    return await opsLabels.deleteLabel(agentId, input);
  }

  async function addIssueLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    labels: string[];
  }) {
    return await opsLabels.addIssueLabels(agentId, input);
  }

  async function removeIssueLabels(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    issueNumber: number;
    labels: string[];
  }) {
    return await opsLabels.removeIssueLabels(agentId, input);
  }

  async function listMilestones(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    state?: 'open' | 'closed' | 'all';
    limit?: number;
  }) {
    return await opsMilestones.listMilestones(agentId, input);
  }

  async function createMilestone(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    title: string;
    description?: string;
    state?: 'open' | 'closed';
    dueOn?: string;
  }) {
    return await opsMilestones.createMilestone(agentId, input);
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
    return await opsMilestones.updateMilestone(agentId, input);
  }

  async function deleteMilestone(agentId: string, input: {
    owner?: string;
    repositoryName: string;
    milestoneNumber: number;
  }) {
    return await opsMilestones.deleteMilestone(agentId, input);
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
      forgeDebug({ scope: 'github-manager', level: 'warn', message: 'GitHub App not active for agent', context: { agentId } });
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
      forgeDebug({ scope: 'github-manager', level: 'error', message: 'Failed to parse GitHub credentials: ' + String(error) });
      return null;
    }
  }

  async function getInstallationOctokit(agentId: string) {
    const credentials = await getActiveCredentials(agentId);
    return await createInstallationOctokit(credentials);
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
    return await app.getInstallationOctokit(credentials.installationId);
  }
}
