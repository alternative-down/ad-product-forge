import { describe, it, expect } from 'vitest';
import {
  normalizeManifestConfig,
  normalizeGitHubAppCredentials,
  normalizeAssignees,
  buildManifestPermissions,
  buildManifestEvents,
  isGitHubSelfEvent,
  isRecord,
  createAppName,
  getRegisterPath,
  getManifestCallbackPath,
  getSetupPath,
  getWebhookPath,
  getHeader,
  escapeHtml,
  toIssueSummary,
  toIssueDetails,
  summarizeGitHubEvent,
  createGitHubInstallWakeContent,
  createGitHubWebhookWakeContent,
} from '../helpers';

// ─── normalizeManifestConfig ────────────────────────────────────────────────

describe('normalizeManifestConfig', () => {
  it('returns parsed config when schema is valid', () => {
    const input = {
      permissions: { administration: false, contents: true, issues: false, metadata: true, organization_projects: false, pull_requests: true, repository_projects: false, workflows: true },
      events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: true },
    };
    const result = normalizeManifestConfig(input);
    expect(result.permissions.contents).toBe(true);
    expect(result.permissions.administration).toBe(false);
    expect(result.events.workflow_run).toBe(true);
  });

  it('returns default config when input is null', () => {
    const result = normalizeManifestConfig(null);
    expect(result.permissions.administration).toBe(true);
    expect(result.events.push).toBe(true);
  });

  it('returns default config when input is undefined', () => {
    const result = normalizeManifestConfig(undefined);
    expect(result.permissions.administration).toBe(true);
  });

  it('returns default config when input is a non-object', () => {
    const result = normalizeManifestConfig('not an object');
    expect(result.permissions.administration).toBe(true);
  });

  it('returns default config when input has partial fields', () => {
    const result = normalizeManifestConfig({ permissions: { administration: true } });
    expect(result.permissions.administration).toBe(true);
  });
});

// ─── normalizeGitHubAppCredentials ───────────────────────────────────────────

describe('normalizeGitHubAppCredentials', () => {
  it('parses valid manifestConfig in credentials', () => {
    const credentials = {
      appId: '123',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----',
      manifestConfig: {
        permissions: { administration: true, contents: true, issues: false, metadata: true, organization_projects: false, pull_requests: true, repository_projects: false, workflows: false },
        events: { push: true, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
      },
    };
    const result = normalizeGitHubAppCredentials(credentials as Parameters<typeof normalizeGitHubAppCredentials>[0]);
    expect(result.manifestConfig.permissions.administration).toBe(true);
    expect(result.manifestConfig.permissions.issues).toBe(false);
  });

  it('falls back to default manifestConfig when undefined', () => {
    const credentials = {
      appId: '123',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----',
    };
    const result = normalizeGitHubAppCredentials(credentials as Parameters<typeof normalizeGitHubAppCredentials>[0]);
    expect(result.manifestConfig.permissions.administration).toBe(true);
  });

  it('falls back to default manifestConfig when invalid', () => {
    const credentials = {
      appId: '123',
      privateKey: '-----BEGIN RSA PRIVATE KEY-----\nkey\n-----END RSA PRIVATE KEY-----',
      manifestConfig: 'not valid',
    };
    const result = normalizeGitHubAppCredentials(credentials as Parameters<typeof normalizeGitHubAppCredentials>[0]);
    expect(result.manifestConfig.permissions.administration).toBe(true);
  });
});

// ─── normalizeAssignees (imported from helpers) ───────────────────────────────

describe('normalizeAssignees', () => {
  it('returns undefined for undefined', () => {
    expect(normalizeAssignees(undefined)).toBeUndefined();
  });

  it('returns undefined for empty array', () => {
    expect(normalizeAssignees([])).toBeUndefined();
  });

  it('keeps regular usernames unchanged', () => {
    expect(normalizeAssignees(['octocat', 'defunkt'])).toEqual(['octocat', 'defunkt']);
  });

  it('appends [bot] to kebab-case accounts', () => {
    expect(normalizeAssignees(['architectron-the-scalabil-sykutp'])).toEqual(['architectron-the-scalabil-sykutp[bot]']);
  });

  it('keeps accounts with [bot] suffix unchanged', () => {
    expect(normalizeAssignees(['dependabot[bot]'])).toEqual(['dependabot[bot]']);
  });

  it('handles mixed inputs', () => {
    expect(normalizeAssignees(['octocat', 'my-app-12345', 'dependabot[bot]'])).toEqual([
      'octocat',
      'my-app-12345[bot]',
      'dependabot[bot]',
    ]);
  });

  it('treats single-segment strings as regular accounts', () => {
    expect(normalizeAssignees(['bot'])).toEqual(['bot']);
  });

  it('treats two-segment kebab-case as GitHub App accounts', () => {
    expect(normalizeAssignees(['my-app-12345'])).toEqual(['my-app-12345[bot]']);
  });

  it('handles numeric-only strings as regular accounts', () => {
    expect(normalizeAssignees(['12345'])).toEqual(['12345']);
  });
});

// ─── buildManifestPermissions ─────────────────────────────────────────────────

describe('buildManifestPermissions', () => {
  const makeConfig = (permissions: Record<string, boolean>) => ({
    permissions,
    events: {},
  });

  it('returns write for true permissions and read for false', () => {
    const config = makeConfig({
      administration: true,
      contents: false,
      issues: true,
      metadata: false,
      organization_projects: true,
      pull_requests: false,
      repository_projects: true,
      workflows: false,
    });
    const result = buildManifestPermissions(config);
    expect(result).toEqual({
      administration: 'write',
      contents: 'read',
      issues: 'write',
      metadata: 'read',
      organization_projects: 'write',
      pull_requests: 'read',
      repository_projects: 'write',
      workflows: 'read',
    });
  });

  it('always returns metadata as read', () => {
    const config = makeConfig({ administration: true, contents: true, issues: true, metadata: true, organization_projects: true, pull_requests: true, repository_projects: true, workflows: true });
    const result = buildManifestPermissions(config);
    expect(result.metadata).toBe('read');
  });
});

// ─── buildManifestEvents ──────────────────────────────────────────────────────

describe('buildManifestEvents', () => {
  const makeConfig = (events: Record<string, boolean>) => ({
    permissions: {},
    events,
  });

  it('returns only enabled events as an array', () => {
    const config = makeConfig({
      push: true,
      pull_request: true,
      pull_request_review: false,
      issues: false,
      issue_comment: true,
      repository: true,
      workflow_run: false,
    });
    const result = buildManifestEvents(config);
    expect(result).toEqual(['push', 'pull_request', 'issue_comment', 'repository']);
  });

  it('returns empty array when all events are disabled', () => {
    const config = makeConfig({
      push: false,
      pull_request: false,
      pull_request_review: false,
      issues: false,
      issue_comment: false,
      repository: false,
      workflow_run: false,
    });
    expect(buildManifestEvents(config)).toEqual([]);
  });

  it('returns all events when all are enabled', () => {
    const config = makeConfig({
      push: true,
      pull_request: true,
      pull_request_review: true,
      issues: true,
      issue_comment: true,
      repository: true,
      workflow_run: true,
    });
    const result = buildManifestEvents(config);
    expect(result).toHaveLength(7);
    expect(result).toContain('push');
    expect(result).toContain('workflow_run');
  });
});

// ─── isGitHubSelfEvent ────────────────────────────────────────────────────────

describe('isGitHubSelfEvent', () => {
  const makeCreds = (appSlug) => ({ status: 'active' as const, appSlug });

  it('returns true when sender matches appSlug', () => {
    expect(isGitHubSelfEvent('my-app', makeCreds('my-app'))).toBe(true);
  });

  it('returns true when sender ends with[bot] matching appSlug', () => {
    expect(isGitHubSelfEvent('my-app[bot]', makeCreds('my-app'))).toBe(true);
  });

  it('returns false when sender does not match appSlug', () => {
    expect(isGitHubSelfEvent('other-app[bot]', makeCreds('my-app'))).toBe(false);
  });

  it('returns false for regular GitHub usernames', () => {
    expect(isGitHubSelfEvent('defunkt', makeCreds('my-app'))).toBe(false);
  });

  it('returns false when sender is undefined', () => {
    expect(isGitHubSelfEvent(undefined, makeCreds('my-app'))).toBe(false);
  });
});

// ─── isRecord ─────────────────────────────────────────────────────────────────

describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it('returns true for objects created with Object.create(null)', () => {
    expect(isRecord(Object.create(null))).toBe(true);
  });

  it('returns false for arrays', () => {
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
  });

  it('returns false for null', () => {
    expect(isRecord(null)).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isRecord('string')).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it('returns true for class instances (plain-object definition)', () => {
    expect(isRecord(new Date())).toBe(true);
    expect(isRecord(new Error())).toBe(true);
  });
});

// ─── createAppName ────────────────────────────────────────────────────────────

describe('createAppName', () => {
  it('appends a nanoid suffix to the agent name', () => {
    const result = createAppName('My Agent', 'agent-123');
    expect(result).toMatch(/^my-agent-[A-Za-z0-9_-]+$/);
  });

  it('strips accents and converts to kebab-case', () => {
    const result = createAppName('café-agent', 'agent-456');
    expect(result).toMatch(/^cafe-agent-[A-Za-z0-9_-]+$/);
  });

  it('strips non-alphanumeric characters', () => {
    const result = createAppName('My_Agent 123!', 'agent-789');
    expect(result).toMatch(/^my-agent-123-[A-Za-z0-9_-]+$/);
  });

  it('truncates base name to fit within GITHUB_APP_NAME_MAX_LENGTH (32)', () => {
    const longName = 'a'.repeat(40);
    const result = createAppName(longName, 'agent-long');
    expect(result.length).toBeLessThanOrEqual(32);
  });

  it('uses fallback with nanoid suffix when base name is empty after normalization', () => {
    const result = createAppName('---', 'agent-xyz');
    expect(result).toMatch(/^agent-[a-z0-9_-]+$/);
  });
});

// ─── URL path helpers ────────────────────────────────────────────────────────

describe('URL path helpers', () => {
  describe('getRegisterPath', () => {
    it('returns the correct register path', () => {
      expect(getRegisterPath('agent-123')).toBe('/github/apps/agent-123/register');
    });

    it('encodes special characters in agentId', () => {
      expect(getRegisterPath('agent/with/slash')).toBe('/github/apps/agent%2Fwith%2Fslash/register');
    });
  });

  describe('getManifestCallbackPath', () => {
    it('returns the correct manifest callback path', () => {
      expect(getManifestCallbackPath('agent-123')).toBe('/github/apps/agent-123/manifest/callback');
    });
  });

  describe('getSetupPath', () => {
    it('returns the correct setup path', () => {
      expect(getSetupPath('agent-123')).toBe('/github/apps/agent-123/setup');
    });
  });

  describe('getWebhookPath', () => {
    it('returns the correct webhook path', () => {
      expect(getWebhookPath('agent-123')).toBe('/webhooks/github/agent-123');
    });
  });
});

// ─── getHeader ────────────────────────────────────────────────────────────────

describe('getHeader', () => {
  it('returns the value for an existing header', () => {
    expect(getHeader({ 'content-type': 'application/json' }, 'content-type')).toBe('application/json');
  });

  it('returns the first element for array values', () => {
    expect(getHeader({ 'x-custom': ['value1', 'value2'] }, 'x-custom')).toBe('value1');
  });

  it('returns undefined for missing headers', () => {
    expect(getHeader({}, 'x-custom')).toBeUndefined();
  });

  it('returns undefined when header value is undefined', () => {
    expect(getHeader({ 'x-custom': undefined }, 'x-custom')).toBeUndefined();
  });

  it('is case-sensitive', () => {
    expect(getHeader({ 'Content-Type': 'text/html' }, 'content-type')).toBeUndefined();
    expect(getHeader({ 'content-type': 'text/html' }, 'content-type')).toBe('text/html');
  });
});

// ─── escapeHtml ───────────────────────────────────────────────────────────────

describe('escapeHtml', () => {
  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes less-than signs', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes greater-than signs', () => {
    expect(escapeHtml('5 > 3')).toBe('5 &gt; 3');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's fine")).toBe("it&#39;s fine");
  });

  it('escapes all characters together', () => {
    expect(escapeHtml('<a href="url?a=1&b=2">Link & Text</a>')).toBe(
      '&lt;a href=&quot;url?a=1&amp;b=2&quot;&gt;Link &amp; Text&lt;/a&gt;',
    );
  });

  it('returns the same string when no special characters', () => {
    expect(escapeHtml('plain text')).toBe('plain text');
  });

  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });
});

// ─── toIssueSummary ───────────────────────────────────────────────────────────

describe('toIssueSummary', () => {
  const makeIssue = (overrides: Partial<Parameters<typeof toIssueSummary>[0]> = {}) =>
    ({
      number: 42,
      title: 'Bug: something broke',
      state: 'open',
      html_url: 'https://github.com/owner/repo/issues/42',
      labels: ['bug', 'priority:high'],
      assignees: [{ login: 'octocat' }],
      milestone: { title: 'v1.0' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      ...overrides,
    }) as Parameters<typeof toIssueSummary>[0];

  it('maps basic fields correctly', () => {
    const issue = makeIssue();
    const result = toIssueSummary(issue);
    expect(result).toEqual({
      number: 42,
      title: 'Bug: something broke',
      state: 'open',
      url: 'https://github.com/owner/repo/issues/42',
      labels: ['bug', 'priority:high'],
      assignees: ['octocat'],
      milestone: 'v1.0',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    });
  });

  it('normalizes label objects to strings', () => {
    const issue = makeIssue({ labels: [{ name: 'enhancement' }, 'frontend'] });
    const result = toIssueSummary(issue);
    expect(result.labels).toEqual(['enhancement', 'frontend']);
  });

  it('defaults assignees to empty array', () => {
    const issue = makeIssue({ assignees: undefined });
    const result = toIssueSummary(issue);
    expect(result.assignees).toEqual([]);
  });

  it('defaults milestone to null', () => {
    const issue = makeIssue({ milestone: null });
    const result = toIssueSummary(issue);
    expect(result.milestone).toBeNull();
  });
});

// ─── toIssueDetails ───────────────────────────────────────────────────────────

describe('toIssueDetails', () => {
  const makeIssue = (overrides: Partial<Parameters<typeof toIssueDetails>[0]> = {}) =>
    ({
      number: 42,
      title: 'Bug: something broke',
      body: 'Issue body text',
      state: 'closed',
      html_url: 'https://github.com/owner/repo/issues/42',
      labels: ['bug'],
      assignees: [{ login: 'octocat' }],
      milestone: { number: 5, title: 'v2.0' },
      comments: 10,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      ...overrides,
    }) as Parameters<typeof toIssueDetails>[0];

  it('maps basic fields correctly', () => {
    const issue = makeIssue();
    const result = toIssueDetails(issue);
    expect(result).toEqual({
      number: 42,
      title: 'Bug: something broke',
      body: 'Issue body text',
      state: 'closed',
      url: 'https://github.com/owner/repo/issues/42',
      labels: ['bug'],
      assignees: ['octocat'],
      milestone: { number: 5, title: 'v2.0' },
      comments: 10,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    });
  });

  it('defaults body to empty string when null', () => {
    const issue = makeIssue({ body: null });
    const result = toIssueDetails(issue);
    expect(result.body).toBe('');
  });

  it('defaults body to empty string when undefined', () => {
    const issue = makeIssue({ body: undefined });
    const result = toIssueDetails(issue);
    expect(result.body).toBe('');
  });

  it('defaults comments to 0 when missing or undefined', () => {
    const issueMissing = makeIssue({ comments: undefined as unknown as number });
    const result = toIssueDetails(issueMissing);
    expect(result.comments).toBe(0);
  });
});

// ─── summarizeGitHubEvent ─────────────────────────────────────────────────────

describe('summarizeGitHubEvent', () => {
  it('summarizes an issues event', () => {
    const result = summarizeGitHubEvent({
      event: 'issues',
      action: 'opened',
      repository: 'owner/repo',
      payload: { issue: { number: 42, title: 'Bug report' } },
    });
    expect(result).toBe('Issue opened in owner/repo: #42 Bug report');
  });

  it('summarizes an issue_comment event', () => {
    const result = summarizeGitHubEvent({
      event: 'issue_comment',
      action: 'created',
      repository: 'owner/repo',
      sender: 'octocat',
      payload: { issue: { number: 10, title: 'Help needed' } },
    });
    expect(result).toBe('Issue comment created in owner/repo: #10 Help needed by octocat');
  });

  it('summarizes a pull_request event', () => {
    const result = summarizeGitHubEvent({
      event: 'pull_request',
      action: 'closed',
      repository: 'owner/repo',
      sender: 'defunkt',
      payload: { pull_request: { number: 7, title: 'Fix bug' } },
    });
    expect(result).toBe('Pull request closed in owner/repo: #7 Fix bug by defunkt');
  });

  it('summarizes a pull_request_review event with review state', () => {
    const result = summarizeGitHubEvent({
      event: 'pull_request_review',
      action: 'submitted',
      repository: 'owner/repo',
      payload: {
        pull_request: { number: 5, title: 'Add feature' },
        review: { state: 'APPROVED' },
      },
    });
    expect(result).toBe('Pull request review submitted in owner/repo: #5 Add feature (approved)');
  });

  it('summarizes a push event', () => {
    const result = summarizeGitHubEvent({
      event: 'push',
      repository: 'owner/repo',
      sender: 'octocat',
      payload: { ref: 'refs/heads/main' },
    });
    expect(result).toBe('Push in owner/repo on main by octocat');
  });

  it('summarizes a create event', () => {
    const result = summarizeGitHubEvent({
      event: 'create',
      action: 'created',
      repository: 'owner/repo',
      sender: 'defunkt',
      payload: { ref_type: 'branch' },
    });
    expect(result).toBe('branch created in owner/repo by defunkt');
  });

  it('summarizes a delete event', () => {
    const result = summarizeGitHubEvent({
      event: 'delete',
      action: 'deleted',
      repository: 'owner/repo',
      payload: { ref_type: 'tag' },
    });
    expect(result).toBe('tag deleted in owner/repo');
  });

  it('summarizes a check_run event', () => {
    const result = summarizeGitHubEvent({
      event: 'check_run',
      action: 'completed',
      repository: 'owner/repo',
    });
    expect(result).toBe('check_run completed in owner/repo');
  });

  it('falls back to basic event name', () => {
    const result = summarizeGitHubEvent({
      event: 'fork',
      repository: 'owner/repo',
    });
    expect(result).toBe('fork in owner/repo');
  });

  it('handles missing optional fields gracefully', () => {
    const result = summarizeGitHubEvent({
      event: 'issues',
      payload: { issue: {} },
    });
    expect(result).toBe('Issue: #?');
  });

  it('handles null issue in issues event', () => {
    const result = summarizeGitHubEvent({
      event: 'issues',
      action: 'opened',
      payload: {},
    });
    expect(result).toBe('Issue opened: #?');
  });
});

// ─── createGitHubInstallWakeContent ──────────────────────────────────────────

describe('createGitHubInstallWakeContent', () => {
  it('includes all fields in the output', () => {
    const result = createGitHubInstallWakeContent({
      agentId: 'agent-123',
      installationId: 98765,
      organization: 'my-org',
      appName: 'My GitHub App',
      appSlug: 'my-github-app',
      timestamp: 1704067200000,
    });
    expect(result).toContain('GitHub App installation completed.');
    expect(result).toContain('agent-123');
    expect(result).toContain('98765');
    expect(result).toContain('my-org');
    expect(result).toContain('My GitHub App');
    expect(result).toContain('my-github-app');
    expect(result).toContain('2024-01-01T00:00:00.000Z');
  });
});

// ─── createGitHubWebhookWakeContent ──────────────────────────────────────────

describe('createGitHubWebhookWakeContent', () => {
  it('includes all required fields', () => {
    const result = createGitHubWebhookWakeContent({
      agentId: 'agent-123',
      deliveryId: 'abc-123',
      event: 'issues',
      repository: 'owner/repo',
      sender: 'octocat',
      summary: 'Issue opened: #42 Bug report',
      timestamp: 1704067200000,
    });
    expect(result).toContain('GitHub webhook received.');
    expect(result).toContain('agent-123');
    expect(result).toContain('abc-123');
    expect(result).toContain('issues');
    expect(result).toContain('2024-01-01T00:00:00.000Z');
    expect(result).toContain('owner/repo');
    expect(result).toContain('octocat');
    expect(result).toContain('Issue opened: #42 Bug report');
  });

  it('handles missing optional fields', () => {
    const result = createGitHubWebhookWakeContent({
      agentId: 'agent-123',
      deliveryId: 'abc-123',
      event: 'push',
      summary: 'Push to main',
      timestamp: 1704067200000,
    });
    expect(result).toContain('GitHub webhook received.');
    expect(result).not.toContain('Action:');
    expect(result).not.toContain('Repository:');
    expect(result).not.toContain('Sender:');
    expect(result).toContain('Push to main');
  });
});
