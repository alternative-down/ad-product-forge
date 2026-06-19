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
import type { Database } from '../database/client';
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
      // @ts-expect-error — the dep type is a 1-arg adapter but createAppName
      // takes 2 args (agentName, agentId). The actual call site (apps.ts:64)
      // casts through (a, b) => string. Refactoring the dep type to a
      // proper 2-arg signature is tracked as a follow-up (#5340-category-C).
      return createAppName(payload as never) as string;
    },
    createGitHubInstallWakeContent: (payload: unknown) =>
      createGitHubInstallWakeContent(
        payload as Parameters<typeof createGitHubInstallWakeContent>[0],
      ),
    createGitHubWebhookWakeContent: (payload: unknown) =>
      createGitHubWebhookWakeContent(
        payload as Parameters<typeof createGitHubWebhookWakeContent>[0],
      ),
    isGitHubSelfEvent: (payload: unknown) => {
      // @ts-expect-error — same shape mismatch as createAppName:
      // isGitHubSelfEvent(sender, credentials) is a 2-arg function but the
      // dep adapter contract is (payload) => boolean. See #5340-category-C.
      return isGitHubSelfEvent(payload as never) as boolean;
    },
    isRecord,
    summarizeGitHubEvent: (payload: unknown) =>
      summarizeGitHubEvent(
        payload as Parameters<typeof summarizeGitHubEvent>[0],
      ),
    normalizeGitHubAppCredentials: (r) =>
      normalizeGitHubAppCredentials(
        r as Parameters<typeof normalizeGitHubAppCredentials>[0],
      ),
    normalizeManifestConfig: (r) =>
      normalizeManifestConfig(r as Parameters<typeof normalizeManifestConfig>[0]),
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
