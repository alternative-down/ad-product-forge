/**
 * Ops Context — shared dependencies available to all ops modules.
 *
 * Sub-interfaces group related properties by domain. They can be used
 * independently with Pick<OpsContext, 'prop'> when only a subset is needed,
 * or accessed via the named sub-interface on OpsContext.
 *
 * Usage in ops modules:
 *   // Current: full context access
 *   export function createLabelsOps(ctx: OpsContext) {
 *     const octokit = await ctx.getInstallationOctokit(agentId);
 *
 *   // Future: selective context access (after migrating)
 *   export function createLabelsOps(ctx: { getInstallationOctokit: OpsContext['auth']['getInstallationOctokit']; getDefaultOwner: OpsContext['config_']['getDefaultOwner'] }) { ... }
 */
import type { Octokit } from 'octokit';

import type { Database } from '../../database/schema';
// @ts-ignore
import type { createSystemIntegrationStore } from '../../system-integrations/store';
import type { createAgentNotificationStore } from '../../notifications/store';
import type { GitHubAppCredentials, GitHubAppManifestConfig, GitHubAppProvisioning } from '../types';
// Deferred: imports from ../helpers.ts — use unknown to avoid namespace resolution errors
// import type { IssuePayload, IssueSummary, IssueDetails } from '../helpers.js';

// ── Sub-interfaces ─────────────────────────────────────────────────────────────

/** Database ORM utilities. */
export interface GithubOpsDb {
  and: typeof import('drizzle-orm').and;
  eq: typeof import('drizzle-orm').eq;
  agentProviders: typeof import('../../database/schema.js').agentProviders;
  agents: typeof import('../../database/schema.js').agents;
}

/** Logging. */
export interface GithubOpsDebug {
  forgeDebug: (opts: { scope: string; level: string; message: string; context?: unknown }) => void;
}

/** GitHub API token and credential management. */
export interface GithubOpsAuth {
  getInstallationOctokit: (agentId: string) => Promise<Octokit>;
  getInstallationToken: (credentials: Extract<GitHubAppCredentials, { status: 'active' }>) => Promise<string>;
  getCredentials: (agentId: string) => Promise<GitHubAppCredentials | null>;
  getActiveCredentials: (agentId: string) => Promise<Extract<GitHubAppCredentials, { status: 'active' }>>;
  saveCredentials: (agentId: string, credentials: GitHubAppCredentials) => Promise<void>;
  parseCredentials: (encryptedCredentials: string) => GitHubAppCredentials | null;
  createInstallationOctokit: (credentials: Extract<GitHubAppCredentials, { status: 'active' }>) => Promise<Octokit>;
  createGitHubApp: (credentials: Extract<GitHubAppCredentials, { status: 'created' | 'active' }>) => unknown;
}

/** HTTP routing path helpers and header utilities. */
export interface GithubOpsRouting {
  getHeader: (headers: Record<string, string | string[] | undefined>, key: string) => string | undefined;
  getRegisterPath: (agentId: string) => string;
  getManifestCallbackPath: (agentId: string) => string;
  getSetupPath: (agentId: string) => string;
  getWebhookPath: (agentId: string) => string;
  escapeHtml: (input: string) => string;
}

/** Issue and assignee formatting helpers. */
export interface GithubOpsHelpers {
  normalizeAssignees: (assignees?: string[] | undefined) => string[] | undefined;
  toIssueSummary: (payload: unknown) => unknown;
  toIssueDetails: (payload: unknown) => unknown;
}

/** GitHub App manifest creation helpers. */
export interface GithubOpsManifest {
  DEFAULT_GITHUB_APP_MANIFEST_CONFIG: GitHubAppManifestConfig;
  buildManifestEvents: (manifestConfig: GitHubAppManifestConfig) => string[];
  buildManifestPermissions: (manifestConfig: GitHubAppManifestConfig) => Record<string, string>;
  createAppName: (payload: unknown) => string;
  createGitHubInstallWakeContent: (payload: unknown) => unknown;
  createGitHubWebhookWakeContent: (payload: unknown) => unknown;
  isGitHubSelfEvent: (payload: unknown) => boolean;
  isRecord: (value: unknown) => boolean;
  summarizeGitHubEvent: (payload: unknown) => string;
  normalizeGitHubAppCredentials: (raw: unknown) => GitHubAppCredentials;
  normalizeManifestConfig: (raw: unknown) => GitHubAppManifestConfig;
}

/** Global config and owner resolution. */
export interface GithubOpsConfig {
  getGlobalConfig: () => Promise<{ organization: string; appHomeUrl: string }>;
  getDefaultOwner: (owner?: string) => Promise<string>;
}

// ── OpsConfig (unchanged) ─────────────────────────────────────────────────────

export interface OpsConfig {
  db: Database;
  httpServer: any;
  publicBaseUrl?: string;
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}

/** Notification store returned by createAgentNotificationStore */
export type AgentNotificationStore = ReturnType<typeof createAgentNotificationStore>;

// ── OpsContext (unchanged — flat properties) ───────────────────────────────────

export interface OpsContext {
  config: OpsConfig;
  notifications: AgentNotificationStore;
  routeCleanups: Map<string, Array<() => void>>;
  GITHUB_PROVIDER_TYPE: string;
  and: typeof import('drizzle-orm').and;
  eq: typeof import('drizzle-orm').eq;
  agentProviders: typeof import('../../database/schema.js').agentProviders;
  agents: typeof import('../../database/schema.js').agents;
  createId: () => string;
  nanoid: (size?: number) => string;
  forgeDebug: (opts: { scope: string; level: string; message: string; context?: unknown }) => void;

  getGlobalConfig: () => Promise<{ organization: string; appHomeUrl: string }>;
  getDefaultOwner: (owner?: string) => Promise<string>;
  getInstallationOctokit: (agentId: string) => Promise<Octokit>;
  getInstallationToken: (credentials: Extract<GitHubAppCredentials, { status: 'active' }>) => Promise<string>;
  getCredentials: (agentId: string) => Promise<GitHubAppCredentials | null>;
  getActiveCredentials: (agentId: string) => Promise<Extract<GitHubAppCredentials, { status: 'active' }>>;
  saveCredentials: (agentId: string, credentials: GitHubAppCredentials) => Promise<void>;
  parseCredentials: (encryptedCredentials: string) => GitHubAppCredentials | null;
  createInstallationOctokit: (credentials: Extract<GitHubAppCredentials, { status: 'active' }>) => Promise<Octokit>;
  createGitHubApp: (credentials: Extract<GitHubAppCredentials, { status: 'created' | 'active' }>) => unknown;

  getHeader: (headers: Record<string, string | string[] | undefined>, key: string) => string | undefined;
  getRegisterPath: (agentId: string) => string;
  getManifestCallbackPath: (agentId: string) => string;
  getSetupPath: (agentId: string) => string;
  getWebhookPath: (agentId: string) => string;
  escapeHtml: (input: string) => string;
  normalizeAssignees: (assignees?: string[] | undefined) => string[] | undefined;
  toIssueSummary: (payload: import('../helpers').IssuePayload) => import('../helpers').IssueSummary;
  toIssueDetails: (payload: import('../helpers').IssuePayload) => import('../helpers').IssueDetails;
  DEFAULT_GITHUB_APP_MANIFEST_CONFIG: GitHubAppManifestConfig;
  buildManifestEvents: (manifestConfig: GitHubAppManifestConfig) => string[];
  buildManifestPermissions: (manifestConfig: GitHubAppManifestConfig) => Record<string, string>;
  createAppName: (payload: unknown) => string;
  createGitHubInstallWakeContent: (payload: unknown) => unknown;
  createGitHubWebhookWakeContent: (payload: unknown) => unknown;
  isGitHubSelfEvent: (payload: unknown) => boolean;
  isRecord: (value: unknown) => boolean;
  summarizeGitHubEvent: (payload: unknown) => string;
  normalizeGitHubAppCredentials: (raw: unknown) => GitHubAppCredentials;
  normalizeManifestConfig: (raw: unknown) => GitHubAppManifestConfig;

  opsRouting: {
    buildProvisioning: (agentId: string, credentials: GitHubAppCredentials) => GitHubAppProvisioning;
    registerAgentRoutes: (agentId: string) => void;
    handleRegisterPage: (agentId: string) => Promise<import('../../http/server.js').HttpResponse>;
    handleManifestCallback: (agentId: string, code: string | null, state: string | null) => Promise<import('../../http/server.js').HttpResponse>;
    handleSetupCallback: (agentId: string, installationIdValue: string | null) => Promise<import('../../http/server.js').HttpResponse>;
    handleWebhook: (agentId: string, headers: Record<string, string>, bodyText: string) => Promise<import('../../http/server.js').HttpResponse>;
  };
}