import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock setup ────────────────────────────────────────────────────────────────
// vi.hoisted runs first so its factory produces the shared mock refs before any
// vi.mock factory is evaluated. All names declared ONLY via vi.hoisted to avoid
// oxc "already declared" errors.
const {
  mockDecryptSecret,
  mockEncryptSecret,
  mockAppInstance,
  AppMock,
} = vi.hoisted(() => {
  const mockDecryptSecret = vi.fn();
  const mockEncryptSecret = vi.fn();
  const mockAppInstance = { getInstallationOctokit: vi.fn() };

  function AppMock() {
    return mockAppInstance;
  }
  AppMock.mock = { clear: vi.fn(), reset: vi.fn() };
  AppMock.mockClear = vi.fn();
  AppMock.mockReset = vi.fn();
  AppMock.mockImplementation = vi.fn();

  return { mockDecryptSecret, mockEncryptSecret, mockAppInstance, AppMock };
});

vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(),
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

vi.mock('../notifications/store', () => ({
  createAgentNotificationStore: vi.fn(() => ({ createNotification: vi.fn() })),
}));

vi.mock('../encryption/crypto', () => ({
  decryptSecret: (...args: unknown[]) => mockDecryptSecret(...args),
  encryptSecret: (...args: unknown[]) => mockEncryptSecret(...args),
}));

// App imported via mock — no static import needed
import { createGitHubAppManager } from './manager';
vi.mock('octokit', () => ({
  App: AppMock,
  Octokit: vi.fn(),
}));

function createMockDb(overrides?: {
  agentProvidersFindFirst?: unknown;
  agentProvidersFindMany?: unknown[];
  agentsFindFirst?: unknown;
}) {
  const db = {
    query: {
      agentProviders: {
        findFirst: vi.fn().mockResolvedValue(overrides?.agentProvidersFindFirst ?? null),
        findMany: vi.fn().mockResolvedValue(overrides?.agentProvidersFindMany ?? []),
      },
      agents: {
        findFirst: vi.fn().mockResolvedValue(overrides?.agentsFindFirst ?? null),
      },
    },
  };
  db.insert = vi.fn(() => ({ values: vi.fn().mockResolvedValue({ rowid: 1 }) }));
  db.update = vi.fn(() => ({ set: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue({}) }) }));
  return db as unknown as ReturnType<typeof createGitHubAppManager> extends { db: infer D } ? D : never;
}

function createMockIntegrations(getGitHubConfigMock: unknown) {
  return {
    getGitHubConfig: vi.fn().mockResolvedValue(getGitHubConfigMock),
  };
}

function createMockHttpServer() {
  return { registerRoute: vi.fn(), route: vi.fn() };
}

function createConfig(githubConfig: unknown = null) {
  return {
    db: createMockDb(),
    httpServer: createMockHttpServer(),
    publicBaseUrl: 'https://forge.example.com',
    integrations: createMockIntegrations(githubConfig),
  };
}

const DEFAULT_MANIFEST_CONFIG = {
  permissions: { administration: true, contents: true, issues: true, metadata: false, organization_projects: false, pull_requests: true, repository_projects: false, workflows: false },
  events: { push: true, pull_request: false, pull_request_review: false, issues: false, issue_comment: false, repository: false, workflow_run: false },
  callbackUrl: '', redirectUrl: '', requestUrl: '', setupUrl: '', publicHomepageUrl: '', description: '',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockActiveAgent() {
  return { id: 'prov-1', agentId: 'agent-1', providerType: 'github-app', encryptedCredentials: 'e30=' };
}

function buildActiveCredentials() {
  return {
    status: 'active' as const,
    appId: 123,
    privateKey: 'pem-data',
    webhookSecret: 'secret',
    appSlug: 'my-app',
    appName: 'My App',
    manifestConfig: DEFAULT_MANIFEST_CONFIG,
    installationId: 456,
    createdAt: Date.now(),
  };
}

function createMockOctokit(response: unknown, isError = false) {
  if (isError) {
    const mock = vi.fn();
    mock.mockRejectedValue(response);
    return { request: mock };
  }
  const mock = vi.fn();
  mock.mockResolvedValue({ data: response });
  return { request: mock };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('createGitHubAppManager — GitHub API surface', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecryptSecret.mockReset();
    mockEncryptSecret.mockReset();
    mockDecryptSecret.mockReturnValue(JSON.stringify(buildActiveCredentials()));
    AppMock.mockClear();
    mockAppInstance.getInstallationOctokit.mockClear();
  });

  // ── updateAgentManifestConfig ───────────────────────────────────────────────

  describe('updateAgentManifestConfig', () => {
    it('updates manifestConfig and returns provisioning with updated config', async () => {
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org', appHomeUrl: 'https://example.com' });
      config.db = db;
      const manager = createGitHubAppManager(config);
      const newManifest = { ...DEFAULT_MANIFEST_CONFIG, description: 'Updated' };
      const result = await manager.updateAgentManifestConfig({ agentId: 'agent-1', manifestConfig: newManifest });
      expect(result).toMatchObject({ agentId: 'agent-1', status: 'active' });
      expect(result.manifestConfig).toMatchObject({ permissions: newManifest.permissions, events: newManifest.events });
    });

    it('throws when credentials not found', async () => {
      const db = createMockDb({ agentProvidersFindFirst: null });
      const config = createConfig({ organization: 'my-org', appHomeUrl: 'https://example.com' });
      config.db = db;
      const manager = createGitHubAppManager(config);
      await expect(
        manager.updateAgentManifestConfig({ agentId: 'unknown', manifestConfig: DEFAULT_MANIFEST_CONFIG }),
      ).rejects.toThrow('GitHub App does not exist for agent unknown');
    });
  });

  // ── Repository CRUD ─────────────────────────────────────────────────────────

  describe('getRepository', () => {
    it('returns normalized repository data', async () => {
      const mockOctokit = createMockOctokit({
        id: 999, name: 'my-repo', full_name: 'my-org/my-repo', private: true,
        default_branch: 'main', html_url: 'https://github.com/my-org/my-repo',
        clone_url: 'https://github.com/my-org/my-repo.git',
        ssh_url: 'git@github.com:my-org/my-repo.git',
      });
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      const result = await createGitHubAppManager(config).getRepository('agent-1', { repositoryName: 'my-repo' });
      expect(result).toMatchObject({ id: 999, name: 'my-repo', fullName: 'my-org/my-repo', private: true, defaultBranch: 'main' });
    });

    it('uses provided owner when given', async () => {
      const mockOctokit = createMockOctokit({ id: 1, name: 'repo', full_name: 'x/repo', private: false, default_branch: 'main', html_url: '', clone_url: '', ssh_url: '' });
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'default-org' });
      config.db = db;
      await createGitHubAppManager(config).getRepository('agent-1', { owner: 'custom-org', repositoryName: 'my-repo' });
      expect(mockOctokit.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}', { owner: 'custom-org', repo: 'my-repo' });
    });

    it('propagates API error', async () => {
      const mockOctokit = createMockOctokit(new Error('Not Found'), true);
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      await expect(
        createGitHubAppManager(config).getRepository('agent-1', { repositoryName: 'missing' }),
      ).rejects.toThrow('Not Found');
    });
  });

  describe('createRepository', () => {
    it('creates a repository and returns normalized result', async () => {
      const mockOctokit = createMockOctokit({
        id: 789, name: 'new-repo', full_name: 'my-org/new-repo', private: true,
        default_branch: 'main', html_url: 'https://github.com/my-org/new-repo', clone_url: '', ssh_url: '',
      });
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      db.insert = vi.fn(() => ({ values: vi.fn().mockResolvedValue({ rowid: 1 }) }));
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      const result = await createGitHubAppManager(config).createRepository('agent-1', { name: 'new-repo', description: 'A new repo', private: true });
      expect(mockOctokit.request).toHaveBeenCalledWith('POST /orgs/{org}/repos', { org: 'my-org', name: 'new-repo', description: 'A new repo', private: true, auto_init: false });
      expect(result.id).toBe(789);
    });
  });

  describe('updateRepository', () => {
    it('patches description and defaultBranch', async () => {
      const mockOctokit = createMockOctokit({ id: 100, name: 'repo', full_name: 'my-org/repo', private: false, default_branch: 'main', html_url: '', clone_url: '', ssh_url: '' });
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      await createGitHubAppManager(config).updateRepository('agent-1', { repositoryName: 'repo', description: 'New desc', defaultBranch: 'develop' });
      expect(mockOctokit.request).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}', { owner: 'my-org', repo: 'repo', description: 'New desc', default_branch: 'develop' });
    });
  });

  describe('deleteRepository', () => {
    it('deletes the repository', async () => {
      const mockOctokit = createMockOctokit(null);
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      await createGitHubAppManager(config).deleteRepository('agent-1', { repositoryName: 'old-repo' });
      expect(mockOctokit.request).toHaveBeenCalledWith('DELETE /repos/{owner}/{repo}', { owner: 'my-org', repo: 'old-repo' });
    });
  });

  // ── Pull Requests ───────────────────────────────────────────────────────────

  describe('listPullRequests', () => {
    it('returns normalized PR list', async () => {
      const mockOctokit = createMockOctokit([
        { number: 1, title: 'PR One', state: 'open', html_url: 'https://github.com/org/repo/pull/1', head: { ref: 'feature' }, base: { ref: 'main' } },
        { number: 2, title: 'PR Two', state: 'closed', html_url: 'https://github.com/org/repo/pull/2', head: { ref: 'fix' }, base: { ref: 'develop' } },
      ]);
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      const result = await createGitHubAppManager(config).listPullRequests('agent-1', { repositoryName: 'repo' });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ number: 1, state: 'open', title: 'PR One', base: 'main' });
      expect(result[1]).toMatchObject({ number: 2, state: 'closed', title: 'PR Two', base: 'develop' });
    });

    it('passes state filter to API', async () => {
      const mockOctokit = createMockOctokit([]);
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      await createGitHubAppManager(config).listPullRequests('agent-1', { repositoryName: 'repo', state: 'closed' });
      expect(mockOctokit.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/pulls', { owner: 'my-org', repo: 'repo', state: 'closed', per_page: 100 });
    });
  });

  describe('getPullRequest', () => {
    it('returns normalized PR with stats', async () => {
      const mockOctokit = createMockOctokit({
        number: 5, title: 'PR #5', state: 'open', html_url: 'https://github.com/org/repo/pull/5',
        head: { ref: 'feat/new' }, base: { ref: 'develop' }, body: 'PR body',
        user: { login: 'dev' }, additions: 50, deletions: 10, changed_files: 3,
      });
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      const result = await createGitHubAppManager(config).getPullRequest('agent-1', { repositoryName: 'repo', pullRequestNumber: 5 });
      expect(result).toMatchObject({ number: 5, title: 'PR #5', state: 'open', body: 'PR body' });
    });
  });

  describe('mergePullRequest', () => {
    it('merges with specified method and returns normalized result', async () => {
      const mockOctokit = createMockOctokit({ merged: true, merge_type: 'squash' });
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      const result = await createGitHubAppManager(config).mergePullRequest('agent-1', { repositoryName: 'repo', pullRequestNumber: 3, mergeMethod: 'squash' });
      expect(result).toMatchObject({ merged: true });
      expect(mockOctokit.request).toHaveBeenCalledWith('PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge', { owner: 'my-org', repo: 'repo', pull_number: 3, merge_method: 'squash' });
    });
  });

  // ── Issues ──────────────────────────────────────────────────────────────────

  describe('listIssues', () => {
    it('returns normalized issue list with labels and assignee', async () => {
      const mockOctokit = createMockOctokit([
        { number: 10, title: 'Bug report', state: 'open', html_url: 'https://github.com/org/repo/issues/10', labels: [{ name: 'bug' }], assignee: null, comments: 2 },
        { number: 11, title: 'Feature request', state: 'closed', html_url: 'https://github.com/org/repo/issues/11', labels: [], assignees: [{ login: 'dev' }], comments: 5 },
      ]);
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      const result = await createGitHubAppManager(config).listIssues('agent-1', { repositoryName: 'repo' });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ number: 10, title: 'Bug report', state: 'open' });
      expect(result[1]).toMatchObject({ number: 11, title: 'Feature request', state: 'closed', assignees: ['dev'] });
    });
  });

  describe('getIssue', () => {
    it('returns normalized issue with labels', async () => {
      const mockOctokit = createMockOctokit({
        number: 7, title: 'Issue #7', state: 'open', html_url: 'https://github.com/org/repo/issues/7',
        body: 'Issue body', labels: [{ name: 'enhancement' }, { name: 'priority' }],
        assignees: [{ login: 'engineer' }], comments: 3, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-02T00:00:00Z',
      });
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      const result = await createGitHubAppManager(config).getIssue('agent-1', { repositoryName: 'repo', issueNumber: 7 });
      expect(result).toMatchObject({
        number: 7, title: 'Issue #7', state: 'open', body: 'Issue body',
        labels: ['enhancement', 'priority'], assignees: ['engineer'], comments: 3,
      });
    });
  });

  describe('createIssue', () => {
    it('creates issue with labels and returns normalized result', async () => {
      const mockOctokit = createMockOctokit({
        number: 20, title: 'New issue', state: 'open', html_url: 'https://github.com/org/repo/issues/20',
        body: 'Issue description', labels: [{ name: 'bug' }], assignee: null, comments: 0,
      });
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      const result = await createGitHubAppManager(config).createIssue('agent-1', { repositoryName: 'repo', title: 'New issue', body: 'Issue description', labels: ['bug'] });
      expect(result.number).toBe(20);
    });
  });

  describe('updateIssue', () => {
    it('patches issue fields', async () => {
      const mockOctokit = createMockOctokit({ number: 15, title: 'Updated', state: 'open', html_url: '', body: 'Updated body', labels: [], assignee: null, comments: 0 });
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      await createGitHubAppManager(config).updateIssue('agent-1', { repositoryName: 'repo', issueNumber: 15, title: 'Updated title', body: 'Updated body' });
      expect(mockOctokit.request).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}/issues/{issue_number}', { owner: 'my-org', repo: 'repo', issue_number: 15, title: 'Updated title', body: 'Updated body' });
    });
  });

  describe('closeIssue', () => {
    it('sets state to closed', async () => {
      const mockOctokit = createMockOctokit({ number: 8, title: 'Issue', state: 'closed', html_url: '', body: '', labels: [], assignee: null, comments: 0 });
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      await createGitHubAppManager(config).closeIssue('agent-1', { repositoryName: 'repo', issueNumber: 8 });
      expect(mockOctokit.request).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}/issues/{issue_number}', { owner: 'my-org', repo: 'repo', issue_number: 8, state: 'closed' });
    });
  });

  describe('reopenIssue', () => {
    it('sets state to open', async () => {
      const mockOctokit = createMockOctokit({ number: 9, title: 'Issue', state: 'open', html_url: '', body: '', labels: [], assignee: null, comments: 0 });
      mockAppInstance.getInstallationOctokit.mockResolvedValue(mockOctokit);
      const db = createMockDb({ agentProvidersFindFirst: mockActiveAgent() });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      await createGitHubAppManager(config).reopenIssue('agent-1', { repositoryName: 'repo', issueNumber: 9 });
      expect(mockOctokit.request).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}/issues/{issue_number}', { owner: 'my-org', repo: 'repo', issue_number: 9, state: 'open' });
    });
  });

  // ── loadAllAgents error paths ────────────────────────────────────────────────

  describe('loadAllAgents — error paths', () => {
    it('silently skips non-active providers', async () => {
      mockDecryptSecret.mockReturnValue(JSON.stringify({ ...buildActiveCredentials(), status: 'created' }));
      const db = createMockDb({
        agentProvidersFindMany: [{ id: 'prov-1', agentId: 'agent-pending', providerType: 'github-app', encryptedCredentials: 'e30=' }],
      });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;
      // Should not throw — non-active credentials are skipped silently
      await expect(createGitHubAppManager(config).loadAllAgents()).resolves.toBeUndefined();
    });

    it('resolves when GitHub integration is not configured (no providers)', async () => {
      const db = createMockDb();
      const config = createConfig(null);
      config.db = db;
      await expect(createGitHubAppManager(config).loadAllAgents()).resolves.toBeUndefined();
    });
  });
});
