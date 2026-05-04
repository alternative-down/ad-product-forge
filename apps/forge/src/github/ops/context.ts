/**
 * Ops Context — shared dependencies available to all ops modules.
 */
import type { Octokit } from 'octokit';
import type { Database } from '../../database/index.js';
import type { HttpServer, HttpRequest, HttpResponse } from '../../http/server.js';
import type { createSystemIntegrationStore } from '../../system-integrations/store.js';
import type { createAgentNotificationStore } from '../../notifications/store.js';
import type { GitHubAppCredentials, GitHubAppManifestConfig } from '../types.js';

/** Notification store returned by createAgentNotificationStore */
export type AgentNotificationStore = ReturnType<typeof createAgentNotificationStore>;

export interface OpsConfig {
  db: Database;
  httpServer: HttpServer;
  publicBaseUrl: string;
  integrations: ReturnType<typeof createSystemIntegrationStore>;
}

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
  createInstallationOctokit: (installationId: number) => Promise<Octokit>;

  getHeader: (headers: Record<string, string>, key: string) => string | null;
  getRegisterPath: (agentId: string) => string;
  getManifestCallbackPath: (agentId: string) => string;
  getSetupPath: (agentId: string) => string;
  getWebhookPath: (agentId: string) => string;
  escapeHtml: (input: string) => string;
  normalizeAssignees: (assignees: string[]) => string[];
  toIssueSummary: (payload: import('../helpers.js').IssuePayload) => import('../helpers.js').IssueSummary;
  toIssueDetails: (payload: import('../helpers.js').IssuePayload) => import('../helpers.js').IssueDetails;
  DEFAULT_GITHUB_APP_MANIFEST_CONFIG: GitHubAppManifestConfig;
  buildManifestEvents: () => string[];
  buildManifestPermissions: (manifestConfig: GitHubAppManifestConfig) => Record<string, string>;
  createAppName: (agentName: string, agentId: string) => string;
  createGitHubInstallWakeContent: (payload: unknown) => unknown;
  createGitHubWebhookWakeContent: (payload: unknown) => unknown;
  isGitHubSelfEvent: (payload: unknown) => boolean;
  isRecord: (value: unknown) => boolean;
  summarizeGitHubEvent: (payload: unknown) => string;
  normalizeGitHubAppCredentials: (raw: unknown) => GitHubAppCredentials;
  normalizeManifestConfig: (raw: unknown) => GitHubAppManifestConfig;
}
