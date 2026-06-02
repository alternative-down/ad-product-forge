/**
 * GitHub App Manager — façade that composes ops subdomains.
 *
 * Part of #5318 — split createGitHubAppManager.
 *
 * Public API (the contract used by 3 test files + external consumers):
 *   isConfigured, getAgentProvisioning, updateAgentManifestConfig,
 *   createAgentApp, loadAllAgents, unloadAgent, deleteAgentApp,
 *   getGitCredentials, listRepositories, createRepository, updateRepository,
 *   deleteRepository, getRepository, listPullRequests, createPullRequest,
 *   getPullRequest, updatePullRequest, mergePullRequest, listPullRequestComments,
 *   listIssues, getIssue, createIssue, updateIssue, closeIssue, reopenIssue,
 *   listIssueComments, getIssueComment, createIssueComment, updateIssueComment,
 *   deleteIssueComment, listLabels, createLabel, updateLabel, deleteLabel,
 *   addIssueLabels, removeIssueLabels, listMilestones, createMilestone,
 *   updateMilestone, deleteMilestone, handleRegisterPage, handleManifestCallback,
 *   handleSetupCallback, handleWebhook
 *
 * Internal structure:
 *   ops/credentials.ts   — encrypted storage
 *   ops/github-app.ts    — auth + Octokit
 *   ops/app-lifecycle.ts — agent provisioning + git credentials
 *   ops/repos.ts         — repository CRUD
 *   ops/pull-requests.ts — PR operations
 *   ops/issues.ts        — issue operations
 *   ops/labels.ts        — label operations
 *   ops/milestones.ts    — milestone operations
 *   ops/routing.ts       — HTTP routing (internal)
 */
import { nanoid } from 'nanoid';
import { and, eq } from 'drizzle-orm';
import { forgeDebug } from '@forge-runtime/core';
import type { Database } from '../database/schema';
import type { createSystemIntegrationStore } from '../system-integrations/store';
import { agentProviders, agents } from '../database/schema';
import type { createForgeHttpServer } from '../http/server';
import { createAgentNotificationStore } from '../notifications/store';
import { createId } from '../utils/id';
import type { Octokit } from 'octokit';
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
import { createCredentialsOps } from './ops/credentials';
import { createGitHubAppOps } from './ops/github-app';
import { createAppLifecycleOps } from './ops/app-lifecycle';
import type { OpsContext } from './ops/context';
import type { GitHubAppCredentials, GitHubAppManifestConfig, GitHubAppProvisioning } from './types';

const GITHUB_PROVIDER_TYPE = 'github-app';

export type GitHubAppManager = ReturnType<typeof createGitHubAppManager>;

/**
 * Creates a per-agent GitHubAppManager instance.
 * Each agent gets its own isolated manager.
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
    forgeDebug: (opts: { scope: string; level: string; message: string; context?: unknown }) =>
      forgeDebug(opts as Parameters<typeof forgeDebug>[0]),
    getGlobalConfig: () => Promise.reject(new Error('getGlobalConfig not initialized')),
    getDefaultOwner: () => Promise.reject(new Error('getDefaultOwner not initialized')),
    getInstallationOctokit: (_agentId: string): Promise<Octokit> =>
      Promise.reject(new Error('getInstallationOctokit not initialized')),
    getInstallationToken: (
      _credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
    ) => Promise.reject(new Error('getInstallationToken not initialized')),
    getCredentials: (_agentId: string) =>
      Promise.reject(new Error('getCredentials not initialized')),
    getActiveCredentials: (_agentId: string) =>
      Promise.reject(new Error('getActiveCredentials not initialized')),
    saveCredentials: (_agentId: string, _credentials: GitHubAppCredentials) =>
      Promise.reject(new Error('saveCredentials not initialized')),
    parseCredentials: (_encryptedCredentials: string) => {
      throw new Error('parseCredentials not initialized');
    },
    createInstallationOctokit: (
      _credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
    ) => Promise.reject(new Error('createInstallationOctokit not initialized')),
    createGitHubApp: (_credentials: Extract<GitHubAppCredentials, { status: 'created' | 'active' }>) => {
      throw new Error('createGitHubApp not initialized');
    },
    getHeader,
    getRegisterPath,
    getManifestCallbackPath,
    getSetupPath,
    getWebhookPath,
    escapeHtml,
    normalizeAssignees,
    DEFAULT_GITHUB_APP_MANIFEST_CONFIG,
    toIssueSummary: (p) => toIssueSummary(p as Parameters<typeof toIssueSummary>[0]) as never,
    toIssueDetails: (p) => toIssueDetails(p as Parameters<typeof toIssueDetails>[0]) as never,
    buildManifestEvents,
    buildManifestPermissions,
    createAppName: (payload: unknown) => {
      // @ts-expect-error adapting unknown to typed input
      return createAppName(payload) as unknown as string;
    },
    createGitHubInstallWakeContent: (payload: unknown) => {
      // @ts-expect-error adapting unknown to typed input
      return createGitHubInstallWakeContent(payload) as unknown as unknown;
    },
    createGitHubWebhookWakeContent: (payload: unknown) => {
      // @ts-expect-error adapting unknown to typed input
      return createGitHubWebhookWakeContent(payload) as unknown as unknown;
    },
    isGitHubSelfEvent: (payload: unknown) => {
      // @ts-expect-error adapting unknown payload to specific function signature
      return isGitHubSelfEvent(payload) as unknown as boolean;
    },
    isRecord,
    summarizeGitHubEvent: (payload: unknown) =>
      summarizeGitHubEvent(
        payload as Parameters<typeof summarizeGitHubEvent>[0],
      ) as unknown as string,
    normalizeGitHubAppCredentials: (r) =>
      normalizeGitHubAppCredentials(
        r as Parameters<typeof normalizeGitHubAppCredentials>[0],
      ) as never,
    normalizeManifestConfig: (r) =>
      normalizeManifestConfig(r as Parameters<typeof normalizeManifestConfig>[0]) as never,
    opsRouting: null as unknown as ReturnType<typeof createRoutingOps>,
  };

  // ── Build credentials and github-app ops (no deps) ─────────────────────────
  const credentials = createCredentialsOps(opsCtx);
  const githubApp = createGitHubAppOps();

  // ── Wire credentials and github-app back into opsCtx ───────────────────────
  opsCtx.getCredentials = credentials.getCredentials;
  opsCtx.getActiveCredentials = credentials.getActiveCredentials;
  opsCtx.saveCredentials = credentials.saveCredentials;
  opsCtx.parseCredentials = credentials.parseCredentials;
  opsCtx.createInstallationOctokit = async (credentialsArg) =>
    await githubApp.createInstallationOctokit(credentialsArg);
  opsCtx.createGitHubApp = (credentialsArg) => githubApp.createGitHubApp(credentialsArg);
  opsCtx.getInstallationOctokit = async (agentId: string) => {
    const creds = await credentials.getActiveCredentials(agentId);
    return await githubApp.createInstallationOctokit(creds);
  };

  // ── Build app-lifecycle ops (depends on credentials + github-app) ──────────
  const appLifecycle = createAppLifecycleOps(opsCtx, {
    githubApp,
    credentials: {
      getCredentials: credentials.getCredentials,
      getActiveCredentials: credentials.getActiveCredentials,
    },
  });

  // Wire lifecycle getters back into opsCtx
  opsCtx.getGlobalConfig = appLifecycle.getGlobalConfig;
  opsCtx.getDefaultOwner = appLifecycle.getDefaultOwner;

  // ── Build other ops (depend on opsCtx.getInstallationOctokit etc.) ─────────
  opsCtx.opsRouting = createRoutingOps(opsCtx as unknown as OpsContext);
  const opsRepos = createReposOps(opsCtx);
  const opsPullRequests = createPullRequestsOps(opsCtx);
  const opsIssues = createIssuesOps(opsCtx);
  const opsLabels = createLabelsOps(opsCtx);
  const opsMilestones = createMilestonesOps(opsCtx);

  // ── Compose public API (the contract used by 3 test files) ───────────────
  return {
    isConfigured: appLifecycle.isConfigured,
    getAgentProvisioning: appLifecycle.getAgentProvisioning,
    updateAgentManifestConfig: appLifecycle.updateAgentManifestConfig,
    createAgentApp: appLifecycle.createAgentApp,
    loadAllAgents: appLifecycle.loadAllAgents,
    unloadAgent: appLifecycle.unloadAgent,
    deleteAgentApp: appLifecycle.deleteAgentApp,
    getGitCredentials: appLifecycle.getGitCredentials,
    ...opsRepos,
    ...opsPullRequests,
    ...opsIssues,
    ...opsLabels,
    ...opsMilestones,
    handleRegisterPage: opsCtx.opsRouting.handleRegisterPage,
    handleManifestCallback: opsCtx.opsRouting.handleManifestCallback,
    handleSetupCallback: opsCtx.opsRouting.handleSetupCallback,
    handleWebhook: opsCtx.opsRouting.handleWebhook,
  };
}

// Re-export types for convenience
export type { GitHubAppProvisioning, GitHubAppCredentials, GitHubAppManifestConfig };
