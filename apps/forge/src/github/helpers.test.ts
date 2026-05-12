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
} from './helpers';

// Re-export DEFAULT for use in tests
import { DEFAULT_GITHUB_APP_MANIFEST_CONFIG } from './helpers';

// --- normalizeManifestConfig ---
describe('normalizeManifestConfig', () => {
  it('returns default config for null/undefined', () => {
    expect(normalizeManifestConfig(null)).toEqual(DEFAULT_GITHUB_APP_MANIFEST_CONFIG);
    expect(normalizeManifestConfig(undefined)).toEqual(DEFAULT_GITHUB_APP_MANIFEST_CONFIG);
  });

  it('returns default for non-object input', () => {
    expect(normalizeManifestConfig('string')).toEqual(DEFAULT_GITHUB_APP_MANIFEST_CONFIG);
    expect(normalizeManifestConfig(123)).toEqual(DEFAULT_GITHUB_APP_MANIFEST_CONFIG);
    expect(normalizeManifestConfig([])).toEqual(DEFAULT_GITHUB_APP_MANIFEST_CONFIG);
  });

  it('returns parsed config with default values for missing fields', () => {
    const input = {
      permissions: { administration: true },
      events: { push: true },
    };
    const result = normalizeManifestConfig(input);
    expect(result.permissions.administration).toBe(true);
    expect(result.events.push).toBe(true);
  });

  it('merges partial valid config with defaults', () => {
    const input = { permissions: { issues: true } };
    const result = normalizeManifestConfig(input);
    expect(result.permissions.issues).toBe(true);
    expect(result.permissions.contents).toBe(DEFAULT_GITHUB_APP_MANIFEST_CONFIG.permissions.contents);
  });
});

// --- normalizeGitHubAppCredentials ---
describe('normalizeGitHubAppCredentials', () => {
  it('returns credentials with normalized manifestConfig', () => {
    const raw = {
      status: 'active' as const,
      appId: 1,
      appSlug: 'my-app',
      clientId: 'client',
      clientSecret: 'secret',
      privateKey: 'key',
      webhookSecret: 'webhook',
      manifestConfig: { permissions: { issues: true }, events: { push: false } },
    };
    const result = normalizeGitHubAppCredentials(raw as any);
    expect(result.manifestConfig.permissions.issues).toBe(true);
    expect(result.manifestConfig.permissions.contents).toBe(
      DEFAULT_GITHUB_APP_MANIFEST_CONFIG.permissions.contents,
    );
  });
});

// --- normalizeAssignees ---
describe('normalizeAssignees', () => {
  it('returns undefined for null/undefined/empty', () => {
    expect(normalizeAssignees(undefined)).toBeUndefined();
    expect(normalizeAssignees(null as unknown as string[])).toBeUndefined();
    expect(normalizeAssignees([])).toBeUndefined();
  });

  it('keeps accounts already ending with [bot]', () => {
    expect(normalizeAssignees(['some-app[bot]', 'regular-user'])).toEqual([
      'some-app[bot]',
      'regular-user[bot]',
    ]);
  });

  it('adds [bot] suffix to kebab-case accounts', () => {
    expect(normalizeAssignees(['architectron-the-scalabil-sykutp'])).toEqual([
      'architectron-the-scalabil-sykutp[bot]',
    ]);
    expect(normalizeAssignees(['my-app-123abc'])).toEqual(['my-app-123abc[bot]']);
    expect(
      normalizeAssignees([
        'foo-bar',
        'plain',
        'a-b-c-d',
        '123-456',
        'a',
        'user-name',
      ]),
    ).toEqual([
      'foo-bar[bot]',
      'plain',
      'a-b-c-d[bot]',
      '123-456[bot]',
      'a',
      'user-name[bot]',
    ]);
  });
});

// --- buildManifestPermissions ---
describe('buildManifestPermissions', () => {
  it('maps true permissions to write', () => {
    const config = DEFAULT_GITHUB_APP_MANIFEST_CONFIG;
    const perms = buildManifestPermissions(config);
    expect(perms.metadata).toBe('read'); // always read
  });

  it('maps false permissions to read', () => {
    const perms = buildManifestPermissions({
      permissions: { administration: false, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
      events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
    });
    expect(perms.administration).toBe('read');
    expect(perms.contents).toBe('read');
    expect(perms.workflows).toBe('read');
  });

  it('maps true permissions to write', () => {
    const perms = buildManifestPermissions({
      permissions: { administration: true, contents: true, issues: true, metadata: true, organization_projects: true, pull_requests: true, repository_projects: true, workflows: true },
      events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
    });
    expect(perms.administration).toBe('write');
    expect(perms.contents).toBe('write');
    expect(perms.workflows).toBe('write');
  });
});

// --- buildManifestEvents ---
describe('buildManifestEvents', () => {
  it('returns only enabled events', () => {
    const events = buildManifestEvents({
      permissions: { administration: false, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
      events: {
        push: true,
        pull_request: true,
        pull_request_review: false,
        issues: true,
        issue_comment: false,
        repository: false,
        workflow_run: false,
      },
    });
    expect(events).toContain('push');
    expect(events).toContain('pull_request');
    expect(events).toContain('issues');
    expect(events).not.toContain('pull_request_review');
    expect(events).not.toContain('workflow_run');
  });

  it('returns empty array when all events are false', () => {
    const events = buildManifestEvents({
      permissions: { administration: false, contents: false, issues: false, metadata: false, organization_projects: false, pull_requests: false, repository_projects: false, workflows: false },
      events: { push: false, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
    });
    expect(events).toEqual([]);
  });
});

// --- isGitHubSelfEvent ---
describe('isGitHubSelfEvent', () => {
  const activeCredentials: any = {
    status: 'active' as const,
    appId: 1,
    appSlug: 'my-agent-app',
    clientId: 'abc',
    clientSecret: 'def',
    privateKey: 'key',
    webhookSecret: 'wh',
    manifestConfig: DEFAULT_GITHUB_APP_MANIFEST_CONFIG,
  };

  it('returns true for matching slug', () => {
    expect(isGitHubSelfEvent('my-agent-app', activeCredentials)).toBe(true);
  });

  it('returns true for slug with [bot] suffix', () => {
    expect(isGitHubSelfEvent('my-agent-app[bot]', activeCredentials)).toBe(true);
  });

  it('returns false for unrelated sender', () => {
    expect(isGitHubSelfEvent('other-user', activeCredentials)).toBe(false);
  });

  it('returns false for undefined sender', () => {
    expect(isGitHubSelfEvent(undefined, activeCredentials)).toBe(false);
  });
});

// --- isRecord ---
describe('isRecord', () => {
  it('returns true for plain objects', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
  });

  it('returns false for null, undefined, and primitives', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord('string')).toBe(false);
    expect(isRecord(123)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });

  it('returns true for plain objects, false for arrays', () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(Object.create(null))).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(isRecord([1, 2, 3])).toBe(false);
  });
});

// --- createAppName ---
describe('createAppName', () => {
  it('creates app name from agent name and ID', () => {
    const name = createAppName('My Agent', 'agent-123');
    // nanoid@5 alphabet: [A-Za-z0-9_-] — underscores are valid characters
    expect(name).toMatch(/^my-agent-[a-z0-9_-]{6}$/);
  });

  it('uses lowercase and replaces spaces/special chars with hyphens', () => {
    const name = createAppName('Test Agent 123!', 'agent-id');
    expect(name).toMatch(/^test-agent-123-[a-zA-Z0-9_-]{6}$/);
  });

  it('handles unicode characters', () => {
    const name = createAppName('Agént Hëllo', 'agent-id');
    expect(name).toMatch(/^agent-hello-[a-zA-Z0-9_-]{6}$/);
  });

  it('uses ID as fallback for empty name', () => {
    const name = createAppName('', 'agent-with-long-id');
    expect(name).toMatch(/^agent-with-long-[a-zA-Z0-9_-]{6}$/);
  });

  it('respects 32 char max length', () => {
    // base + dash + 6-char suffix
    // Max base = 32 - 1 - 6 = 25
    const longName = 'a'.repeat(30);
    const name = createAppName(longName, 'agent-id');
    expect(name.length).toBeLessThanOrEqual(32);
  });

  it('produces unique names per call', () => {
    const name1 = createAppName('Test', 'agent-1');
    const name2 = createAppName('Test', 'agent-1');
    expect(name1).not.toBe(name2);
  });
});

// --- URL path helpers ---
describe('getRegisterPath', () => {
  it('returns encoded path for agent ID', () => {
    expect(getRegisterPath('agent-123')).toBe('/github/apps/agent-123/register');
    expect(getRegisterPath('agent/special')).toBe('/github/apps/agent%2Fspecial/register');
  });
});

describe('getManifestCallbackPath', () => {
  it('returns encoded path for agent ID', () => {
    expect(getManifestCallbackPath('agent-456')).toBe('/github/apps/agent-456/manifest/callback');
  });
});

describe('getSetupPath', () => {
  it('returns encoded path for agent ID', () => {
    expect(getSetupPath('agent-789')).toBe('/github/apps/agent-789/setup');
  });
});

describe('getWebhookPath', () => {
  it('returns encoded path for agent ID', () => {
    expect(getWebhookPath('webhook-agent')).toBe('/webhooks/github/webhook-agent');
  });
});

// --- getHeader ---
describe('getHeader', () => {
  it('returns string value directly', () => {
    expect(getHeader({ 'content-type': 'text/plain' }, 'content-type')).toBe('text/plain');
  });

  it('returns first element of array value', () => {
    expect(getHeader({ 'set-cookie': ['a', 'b'] }, 'set-cookie')).toBe('a');
  });

  it('returns undefined for missing header', () => {
    expect(getHeader({}, 'x-custom')).toBeUndefined();
  });

  it('returns undefined for undefined header', () => {
    expect(getHeader({ 'x-custom': undefined }, 'x-custom')).toBeUndefined();
  });
});

// --- escapeHtml ---
describe('escapeHtml', () => {
  it('escapes angle brackets', () => {
    expect(escapeHtml('<div>')).toBe('&lt;div&gt;');
  });

  it('escapes ampersand', () => {
    expect(escapeHtml('A & B')).toBe('A &amp; B');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hi"')).toBe('say &quot;hi&quot;');
  });

  it('handles strings with no special chars', () => {
    expect(escapeHtml('plain text 123')).toBe('plain text 123');
  });

  it('handles empty string', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes < > & " and single quotes', () => {
    const sq = String.fromCharCode(39);
    expect(escapeHtml('<>&"' + sq + 'text')).toBe('&lt;&gt;&amp;&quot;&#39;text');
  });
});

// --- toIssueSummary ---
describe('toIssueSummary', () => {
  it('extracts summary fields from issue', () => {
    const issue = {
      number: 42,
      title: 'Bug report',
      state: 'open',
      html_url: 'https://github.com/owner/repo/issues/42',
      labels: ['bug', { name: 'high-priority' }],
      assignees: [{ login: 'alice' }, { login: 'bob' }],
      milestone: { title: 'v1.0' },
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
    };
    const summary = toIssueSummary(issue);
    expect(summary).toEqual({
      number: 42,
      title: 'Bug report',
      state: 'open',
      url: 'https://github.com/owner/repo/issues/42',
      labels: ['bug', 'high-priority'],
      assignees: ['alice', 'bob'],
      milestone: 'v1.0',
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-02T00:00:00Z',
    });
  });

  it('handles missing optional fields', () => {
    const summary = toIssueSummary({
      number: 1,
      title: 'No details',
      state: 'closed',
      html_url: 'http://example.com',
      labels: [],
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    });
    expect(summary.assignees).toEqual([]);
    expect(summary.milestone).toBeNull();
  });
});

// --- toIssueDetails ---
describe('toIssueDetails', () => {
  it('extracts detailed fields including body and comments', () => {
    const issue = {
      number: 5,
      title: 'Feature request',
      body: 'Please add this feature',
      state: 'open',
      html_url: 'https://github.com/owner/repo/issues/5',
      labels: ['enhancement'],
      assignees: [{ login: 'charlie' }],
      milestone: { number: 2, title: 'v2.0' },
      comments: 10,
      created_at: '2024-03-01T00:00:00Z',
      updated_at: '2024-03-02T00:00:00Z',
    };
    const details = toIssueDetails(issue);
    expect(details.body).toBe('Please add this feature');
    expect(details.comments).toBe(10);
    expect(details.milestone).toEqual({ number: 2, title: 'v2.0' });
  });

  it('defaults body to empty string for null/undefined', () => {
    const details = toIssueDetails({
      number: 1,
      title: 'Test',
      body: null,
      state: 'open',
      html_url: 'http://x.com',
      labels: [],
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    });
    expect(details.body).toBe('');
  });

  it('defaults comments to 0 when missing', () => {
    const details = toIssueDetails({
      number: 1,
      title: 'Test',
      state: 'open',
      html_url: 'http://x.com',
      labels: [],
      created_at: '2024-01-01',
      updated_at: '2024-01-02',
    });
    expect(details.comments).toBe(0);
  });
});

// --- summarizeGitHubEvent ---
describe('summarizeGitHubEvent', () => {
  it('summarizes issue events', () => {
    const result = summarizeGitHubEvent({
      event: 'issues',
      action: 'opened',
      repository: 'owner/repo',
      sender: 'alice',
      payload: { issue: { number: 42, title: 'Bug found' } },
    });
    expect(result).toBe('Issue opened in owner/repo: #42 Bug found by alice');
  });

  it('summarizes issue_comment events', () => {
    const result = summarizeGitHubEvent({
      event: 'issue_comment',
      action: 'created',
      repository: 'owner/repo',
      sender: 'bob',
      payload: { issue: { number: 5, title: 'Question' } },
    });
    expect(result).toBe('Issue comment created in owner/repo: #5 Question by bob');
  });

  it('summarizes pull_request events', () => {
    const result = summarizeGitHubEvent({
      event: 'pull_request',
      action: 'opened',
      repository: 'owner/repo',
      sender: 'charlie',
      payload: { pull_request: { number: 10, title: 'Fix bug' } },
    });
    expect(result).toBe('Pull request opened in owner/repo: #10 Fix bug by charlie');
  });

  it('summarizes pull_request_review events with review state', () => {
    const result = summarizeGitHubEvent({
      event: 'pull_request_review',
      action: 'submitted',
      repository: 'owner/repo',
      sender: 'diana',
      payload: {
        pull_request: { number: 15, title: 'Add feature' },
        review: { state: 'approved' },
      },
    });
    expect(result).toBe('Pull request review submitted in owner/repo: #15 Add feature (approved) by diana');
  });

  it('summarizes push events with branch', () => {
    const result = summarizeGitHubEvent({
      event: 'push',
      repository: 'owner/repo',
      sender: 'eve',
      payload: { ref: 'refs/heads/main' },
    });
    expect(result).toBe('Push in owner/repo on main by eve');
  });

  it('handles missing payload fields gracefully', () => {
    const result = summarizeGitHubEvent({
      event: 'issues',
      action: 'closed',
      payload: {},
    });
    expect(result).toBe('Issue closed: #?');
  });

  it('handles empty payload', () => {
    const result = summarizeGitHubEvent({
      event: 'issues',
      payload: null as unknown as unknown,
    });
    expect(result).toBe('Issue: #?');
  });
});
