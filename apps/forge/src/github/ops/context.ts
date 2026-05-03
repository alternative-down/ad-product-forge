/**
 * Ops Context — shared dependencies available to all ops modules.
 * These are the internal functions that each ops module needs.
 */
import type { Octokit } from 'octokit';
import type { GitHubAppCredentials, GitHubAppManifestConfig } from '../types.js';

export interface OpsContext {
  config: {
    db: unknown;
    httpServer: unknown;
    publicBaseUrl: string;
    integrations: unknown;
  };
  notifications: unknown;
  routeCleanups: Map<string, Array<() => void>>;
  GITHUB_PROVIDER_TYPE: string;
  and: unknown;
  eq: unknown;
  agentProviders: unknown;
  agents: unknown;
  createId: () => string;
  nanoid: (size?: number) => string;
  forgeDebug: (...args: unknown[]) => void;

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
  normalizeAssignees: (assignees: unknown[]) => string[];
  toIssueSummary: (payload: unknown) => unknown;
  toIssueDetails: (payload: unknown) => unknown;
  DEFAULT_GITHUB_APP_MANIFEST_CONFIG: GitHubAppManifestConfig;
  buildManifestEvents: () => string[];
  buildManifestPermissions: (manifestConfig: unknown) => Record<string, string>;
  createAppName: (agentName: string, agentId: string) => string;
  createGitHubInstallWakeContent: (payload: unknown) => unknown;
  createGitHubWebhookWakeContent: (payload: unknown) => unknown;
  isGitHubSelfEvent: (payload: unknown) => boolean;
  isRecord: (value: unknown) => boolean;
  summarizeGitHubEvent: (payload: unknown) => string;
  normalizeGitHubAppCredentials: (raw: unknown) => unknown;
  normalizeManifestConfig: (raw: unknown) => unknown;
}