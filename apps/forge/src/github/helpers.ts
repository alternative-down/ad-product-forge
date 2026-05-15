import { nanoid } from 'nanoid';

import {
  githubAppManifestConfigSchema,
  type GitHubAppManifestConfig,
  type GitHubAppCredentials,
} from './types';

// Constants
const GITHUB_APP_NAME_SUFFIX_LENGTH = 6;
const GITHUB_APP_NAME_MAX_LENGTH = 32;

// Default config (duplicated here so helpers.ts is self-contained)
// eslint-disable-next-line prefer-const
export let DEFAULT_GITHUB_APP_MANIFEST_CONFIG: GitHubAppManifestConfig = {
  permissions: {
    administration: true,
    contents: true,
    issues: true,
    metadata: true,
    organization_projects: true,
    pull_requests: true,
    repository_projects: true,
    workflows: false,
  },
  events: {
    push: true,
    pull_request: true,
    pull_request_review: true,
    issues: true,
    issue_comment: true,
    repository: true,
    workflow_run: false,
  },
};

/**
 * Returns a normalized GitHub App manifest config, or the default if parsing fails.
 */
export function normalizeManifestConfig(value: unknown): GitHubAppManifestConfig {
  const parsed = githubAppManifestConfigSchema.safeParse(value);
  if (parsed.success) {
    return parsed.data;
  }
  return DEFAULT_GITHUB_APP_MANIFEST_CONFIG;
}

/**
 * Normalizes GitHub App credentials, ensuring manifestConfig is a valid parsed object.
 */
export function normalizeGitHubAppCredentials(
  credentials: Omit<GitHubAppCredentials, 'manifestConfig'> & { manifestConfig?: unknown },
): GitHubAppCredentials {
  return {
    ...credentials,
    manifestConfig: normalizeManifestConfig(credentials.manifestConfig),
  } as GitHubAppCredentials;
}

/**
 * Normalizes GitHub usernames for assignees.
 * - Accounts already ending with [bot] are used as-is
 * - GitHub App bot accounts (kebab-case like "architectron-the-scalabil-sykutp")
 *   need [bot] suffix appended
 * - Regular accounts are used as-is
 */
export function normalizeAssignees(assignees?: string[]): string[] | undefined {
  if (!assignees || assignees.length === 0) {
    return undefined;
  }

  // GitHub App bot accounts follow the pattern: app-name-appId
  // They have at least 2 kebab-case segments and end with an alphanumeric ID
  // Examples: architectron-the-scalabil-sykutp, wireframe-wizard-pixelia-l85akb
  const gitHubAppPattern = /^[a-z0-9]+(-[a-z0-9]+)+$/;

  return assignees.map((assignee) => {
    // Already has [bot] suffix - use as-is
    if (assignee.endsWith('[bot]')) {
      return assignee;
    }

    // GitHub App bot accounts (kebab-case): add [bot] suffix
    if (gitHubAppPattern.test(assignee)) {
      return `${assignee}[bot]`;
    }

    // Regular accounts: use as-is
    return assignee;
  });
}

/**
 * Builds a GitHub App permissions object from manifest config.
 */
export function buildManifestPermissions(manifestConfig: GitHubAppManifestConfig) {
  return {
    administration: manifestConfig.permissions.administration ? 'write' : 'read',
    contents: manifestConfig.permissions.contents ? 'write' : 'read',
    issues: manifestConfig.permissions.issues ? 'write' : 'read',
    metadata: 'read',
    organization_projects: manifestConfig.permissions.organization_projects ? 'write' : 'read',
    pull_requests: manifestConfig.permissions.pull_requests ? 'write' : 'read',
    repository_projects: manifestConfig.permissions.repository_projects ? 'write' : 'read',
    workflows: manifestConfig.permissions.workflows ? 'write' : 'read',
  };
}

/**
 * Builds a list of GitHub App event names from manifest config.
 */
export function buildManifestEvents(manifestConfig: GitHubAppManifestConfig) {
  return Object.entries(manifestConfig.events)
    .filter(([, enabled]) => enabled)
    .map(([event]) => event);
}

/**
 * Returns true if the sender matches the GitHub App's own slug (self-event).
 */
export function isGitHubSelfEvent(
  sender: string | undefined,
  credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
): boolean {
  if ((sender ?? '') === '') {
    return false;
  }
  return sender === credentials.appSlug || sender === `${credentials.appSlug}[bot]`;
}

/**
 * Type guard for plain objects.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Creates a GitHub App name from agent name + ID, with a random suffix to ensure uniqueness.
 * Truncates and sanitizes the agent name, then appends a nanoid suffix.
 * Max length: 32 chars (GitHub limit).
 */
export function createAppName(agentName: string, agentId: string): string {
  const suffix = nanoid(GITHUB_APP_NAME_SUFFIX_LENGTH).toLowerCase();
  const fallbackBaseName = agentId.slice(0, 15);
  const normalizedBaseName = agentName
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallbackBaseName;
  const maxBaseLength = GITHUB_APP_NAME_MAX_LENGTH - suffix.length - 1;
  const baseName = normalizedBaseName.slice(0, maxBaseLength).replace(/-+$/g, '') || fallbackBaseName;
  return `${baseName}-${suffix}`;
}

/**
 * Returns the GitHub App registration URL path for an agent.
 */
export function getRegisterPath(agentId: string): string {
  return `/github/apps/${encodeURIComponent(agentId)}/register`;
}

/**
 * Returns the GitHub App manifest callback URL path for an agent.
 */
export function getManifestCallbackPath(agentId: string): string {
  return `/github/apps/${encodeURIComponent(agentId)}/manifest/callback`;
}

/**
 * Returns the GitHub App setup URL path for an agent.
 */
export function getSetupPath(agentId: string): string {
  return `/github/apps/${encodeURIComponent(agentId)}/setup`;
}

/**
 * Returns the GitHub webhook URL path for an agent.
 */
export function getWebhookPath(agentId: string): string {
  return `/webhooks/github/${encodeURIComponent(agentId)}`;
}

/**
 * Extracts a header value from a headers record, handling both single values and arrays.
 */
export function getHeader(headers: Record<string, string | string[] | undefined>, name: string): string | undefined {
  const value = headers[name];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Escapes HTML special characters in a string.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Summarizes a GitHub issue into a lightweight summary.
 */
export function toIssueSummary(issue: {
  number: number;
  title: string;
  state: string;
  html_url: string;
  labels: Array<string | { name: string }>;
  assignees?: Array<{ login: string }>;
  milestone?: { title: string } | null;
  created_at: string;
  updated_at: string;
}) {
  return {
    number: issue.number,
    title: issue.title,
    state: issue.state,
    url: issue.html_url,
    labels: issue.labels.map((label) => (typeof label === 'string' ? label : label.name)),
    assignees: issue.assignees?.map((assignee) => assignee.login) ?? [],
    milestone: issue.milestone?.title ?? null,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  };
}

/**
 * Summarizes a GitHub issue into detailed summary including body and comments count.
 */
export function toIssueDetails(issue: {
  number: number;
  title: string;
  body?: string | null;
  state: string;
  html_url: string;
  labels: Array<string | { name: string }>;
  assignees?: Array<{ login: string }>;
  milestone?: { number: number; title: string } | null;
  comments?: number;
  created_at: string;
  updated_at: string;
}) {
  return {
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    state: issue.state,
    url: issue.html_url,
    labels: issue.labels.map((label) => (typeof label === 'string' ? label : label.name)),
    assignees: issue.assignees?.map((assignee) => assignee.login) ?? [],
    milestone: issue.milestone
      ? {
          number: issue.milestone.number,
          title: issue.milestone.title,
        }
      : null,
    comments: issue.comments ?? 0,
    createdAt: issue.created_at,
    updatedAt: issue.updated_at,
  };
}

/**
 * Creates human-readable summary text for a GitHub webhook event.
 */
// ── Webhook summary formatters (strategy dispatch map) ───────────────────────

type GitHubEventInput = {
  event: string;
  action?: string;
  repository?: string;
  sender?: string;
  payload: unknown;
};

function buildSuffix(action?: string, repository?: string, sender?: string) {
  return {
    actionText: (action ?? '') !== '' ? ' ' + action : '',
    repositoryText: (repository ?? '') !== '' ? ' in ' + repository : '',
    senderText: (sender ?? '') !== '' ? ' by ' + sender : '',
  };
}

function extractIssueRef(issue: unknown): { number: number | null; title: string | null } {
  if (!isRecord(issue)) return { number: null, title: null };
  return {
    number: typeof issue.number === 'number' ? issue.number : null,
    title: typeof issue.title === 'string' ? issue.title : null,
  };
}

function formatIssueRef(
  prefix: string,
  issue: unknown,
  suffix: { actionText: string; repositoryText: string; senderText: string },
) {
  const { number, title } = extractIssueRef(issue);
  const titlePart = (title ?? '') !== '' ? ' ' + title : '';
  return (prefix + suffix.actionText + suffix.repositoryText + ': #' + (number ?? '?') + titlePart + suffix.senderText).trim();
}

function formatPullRequestRef(
  pullRequest: unknown,
  suffix: { actionText: string; repositoryText: string; senderText: string },
) {
  if (!isRecord(pullRequest)) return null;
  const { number, title } = extractIssueRef(pullRequest);
  const titlePart = (title ?? '') !== '' ? ' ' + title : '';
  return ('Pull request' + suffix.actionText + suffix.repositoryText + ': #' + (number ?? '?') + titlePart + suffix.senderText).trim();
}

type EventFormatter = (
  payloadRecord: Record<string, unknown>,
  suffix: { actionText: string; repositoryText: string; senderText: string },
) => string | null;

const eventFormatters: Record<string, EventFormatter> = {
  issues: (payloadRecord, suffix) =>
    formatIssueRef('Issue', payloadRecord.issue, suffix),

  issue_comment: (payloadRecord, suffix) =>
    formatIssueRef('Issue comment', payloadRecord.issue, suffix),

  pull_request: (payloadRecord, suffix) =>
    formatPullRequestRef(payloadRecord.pull_request, suffix),

  pull_request_review: (payloadRecord, suffix) => {
    if (!isRecord(payloadRecord.pull_request)) return null;
    const { number, title } = extractIssueRef(payloadRecord.pull_request);
    const review = payloadRecord.review;
    const reviewState =
      isRecord(review) && typeof review.state === 'string'
        ? ' (' + review.state.toLowerCase() + ')'
        : '';
    const titlePart = (title ?? '') !== '' ? ' ' + title : '';
    return ('Pull request review' + suffix.actionText + suffix.repositoryText + ': #' + (number ?? '?') + titlePart + reviewState + suffix.senderText).trim();
  },

  push: (payloadRecord, suffix) => {
    const ref =
      typeof payloadRecord.ref === 'string'
        ? payloadRecord.ref.replace('refs/heads/', '')
        : null;
    const refPart = (ref ?? '') !== '' ? ' on ' + ref : '';
    return ('Push' + suffix.repositoryText + refPart + suffix.senderText).trim();
  },

  create: (payloadRecord, suffix) => {
    const refType =
      typeof payloadRecord.ref_type === 'string' ? payloadRecord.ref_type : null;
    return ((refType ?? 'ref') + suffix.actionText + suffix.repositoryText + suffix.senderText).trim();
  },

  delete: (payloadRecord, suffix) => {
    const refType =
      typeof payloadRecord.ref_type === 'string' ? payloadRecord.ref_type : null;
    return ((refType ?? 'ref') + suffix.actionText + suffix.repositoryText + suffix.senderText).trim();
  },

  check_run: (_payloadRecord, suffix) =>
    ('check_run' + suffix.actionText + suffix.repositoryText + suffix.senderText).trim(),

  check_suite: (_payloadRecord, suffix) =>
    ('check_suite' + suffix.actionText + suffix.repositoryText + suffix.senderText).trim(),
};

/**
 * Creates human-readable summary text for a GitHub webhook event.
 * Uses a strategy dispatch map — each handler has cyclomatic complexity ≤2,
 * making the function easy to test and extend.
 */
export function summarizeGitHubEvent(input: GitHubEventInput): string {
  const payloadRecord = isRecord(input.payload) ? (input.payload as Record<string, unknown>) : {};
  const suffix = buildSuffix(input.action, input.repository, input.sender);
  const formatter = eventFormatters[input.event];
  if (formatter !== undefined) {
    const result = formatter(payloadRecord, suffix);
    if ((result ?? '') !== '') return result;
  }
  return (input.event + suffix.repositoryText + suffix.senderText).trim();
}
export function createGitHubInstallWakeContent(input: {
  agentId: string;
  installationId: number;
  organization: string;
  appName: string;
  appSlug: string;
  timestamp: number;
}): string {
  return [
    'GitHub App installation completed.',
    `Agent id: ${input.agentId}`,
    `Installation id: ${input.installationId}`,
    `Organization: ${input.organization}`,
    `App name: ${input.appName}`,
    `App slug: ${input.appSlug}`,
    `Timestamp: ${new Date(input.timestamp).toISOString()}`,
  ].join('\n');
}

/**
 * Creates wake content for a GitHub webhook event.
 */
export function createGitHubWebhookWakeContent(input: {
  agentId: string;
  deliveryId: string;
  event: string;
  action?: string;
  repository?: string;
  sender?: string;
  summary: string;
  timestamp: number;
}): string {
  const lines = [
    'GitHub webhook received.',
    `Agent id: ${input.agentId}`,
    `Delivery id: ${input.deliveryId}`,
    `Event: ${input.event}`,
    `Timestamp: ${new Date(input.timestamp).toISOString()}`,
  ];

  if ((input.action ?? '') !== '') {
    lines.push(`Action: ${input.action}`);
  }

  if ((input.repository ?? '') !== '') {
    lines.push(`Repository: ${input.repository}`);
  }

  if ((input.sender ?? '') !== '') {
    lines.push(`Sender: ${input.sender}`);
  }

  lines.push('', 'Summary:', input.summary);

  return lines.join('\n');
}
