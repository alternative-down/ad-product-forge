import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpsContext } from './context';

const octokitMock = vi.hoisted(() => ({ request: vi.fn() }));

function makeCtx(): OpsContext {
  return {
    config: {
      db: vi.fn() as unknown as OpsContext['config']['db'],
      httpServer: vi.fn() as unknown as OpsContext['config']['httpServer'],
      publicBaseUrl: 'https://forge.example.com',
      integrations: vi.fn() as unknown as OpsContext['config']['integrations'],
    },
    notifications: vi.fn() as unknown as OpsContext['notifications'],
    routeCleanups: new Map(),
    createGitHubApp: vi.fn() as any,
    opsRouting: {} as any,
    GITHUB_PROVIDER_TYPE: 'github',
    and: vi.fn() as unknown as OpsContext['and'],
    eq: vi.fn() as unknown as OpsContext['eq'],
    agentProviders: vi.fn() as unknown as OpsContext['agentProviders'],
    agents: vi.fn() as unknown as OpsContext['agents'],
    createId: () => 'test-id',
    nanoid: () => 'nano-id',
    forgeDebug: vi.fn(),
    getGlobalConfig: vi.fn().mockResolvedValue({
      organization: 'acme',
      appHomeUrl: 'https://github.com/apps/test',
    }) as unknown as OpsContext['getGlobalConfig'],
    getDefaultOwner: vi.fn().mockResolvedValue('acme') as unknown as OpsContext['getDefaultOwner'],
    getInstallationOctokit: vi
      .fn()
      .mockResolvedValue(octokitMock as any) as unknown as OpsContext['getInstallationOctokit'],
    getInstallationToken: vi.fn() as unknown as OpsContext['getInstallationToken'],
    getCredentials: vi.fn() as unknown as OpsContext['getCredentials'],
    getActiveCredentials: vi.fn() as unknown as OpsContext['getActiveCredentials'],
    saveCredentials: vi.fn() as unknown as OpsContext['saveCredentials'],
    parseCredentials: vi.fn() as unknown as OpsContext['parseCredentials'],
    createInstallationOctokit: vi.fn() as unknown as OpsContext['createInstallationOctokit'],
    getHeader: vi.fn(),
    getRegisterPath: (id: string) => `/r/${id}`,
    getManifestCallbackPath: (id: string) => `/c/${id}`,
    getSetupPath: (id: string) => `/s/${id}`,
    getWebhookPath: (id: string) => `/w/${id}`,
    escapeHtml: (s: string) => s,
    normalizeAssignees: ((a: string[]) => a) as any,
    toIssueSummary: vi.fn() as unknown as OpsContext['toIssueSummary'],
    toIssueDetails: vi.fn() as unknown as OpsContext['toIssueDetails'],
    DEFAULT_GITHUB_APP_MANIFEST_CONFIG: {
      url: '',
      callbackUrls: [],
      redirectUrl: '',
      hookAttributes: {},
      callbackURL: '',
    } as any,
    buildManifestEvents: () => ['issues'],
    buildManifestPermissions: () => ({}),
    createAppName: ((n: string, id: string) => `${n}-${id}`) as any,
    createGitHubInstallWakeContent:
      vi.fn() as unknown as OpsContext['createGitHubInstallWakeContent'],
    createGitHubWebhookWakeContent:
      vi.fn() as unknown as OpsContext['createGitHubWebhookWakeContent'],
    isGitHubSelfEvent: vi.fn() as unknown as OpsContext['isGitHubSelfEvent'],
    isRecord: vi.fn() as unknown as OpsContext['isRecord'],
    summarizeGitHubEvent: vi.fn() as unknown as OpsContext['summarizeGitHubEvent'],
    normalizeGitHubAppCredentials:
      vi.fn() as unknown as OpsContext['normalizeGitHubAppCredentials'],
    normalizeManifestConfig: vi.fn() as unknown as OpsContext['normalizeManifestConfig'],
  };
}

describe('createPullRequestsOps', () => {
  beforeEach(() => octokitMock.request.mockReset());

  // ─── listPullRequests ────────────────────────────────────────────────────────

  it('listPullRequests returns formatted PR list', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({
      data: [
        {
          number: 1,
          title: 'Fix bug',
          state: 'open',
          html_url: 'https://github.com/acme/repo/pull/1',
          head: { ref: 'fix-branch' },
          base: { ref: 'main' },
        },
        {
          number: 2,
          title: 'Add feature',
          state: 'closed',
          html_url: 'https://github.com/acme/repo/pull/2',
          head: { ref: 'feat-branch' },
          base: { ref: 'develop' },
        },
      ],
    });

    const ops = createPullRequestsOps(makeCtx());
    const result = await ops.listPullRequests('agent-1', { repositoryName: 'repo' });

    expect(result).toEqual([
      {
        number: 1,
        title: 'Fix bug',
        state: 'open',
        url: 'https://github.com/acme/repo/pull/1',
        head: 'fix-branch',
        base: 'main',
      },
      {
        number: 2,
        title: 'Add feature',
        state: 'closed',
        url: 'https://github.com/acme/repo/pull/2',
        head: 'feat-branch',
        base: 'develop',
      },
    ]);
  });

  it('listPullRequests uses default state "open"', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({ data: [] });

    await createPullRequestsOps(makeCtx()).listPullRequests('agent-1', { repositoryName: 'repo' });

    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/pulls',
      expect.objectContaining({ state: 'open' }),
    );
  });

  it('listPullRequests forwards state parameter', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({ data: [] });

    await createPullRequestsOps(makeCtx()).listPullRequests('agent-1', {
      repositoryName: 'repo',
      state: 'all',
    });

    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/pulls',
      expect.objectContaining({ state: 'all' }),
    );
  });

  // ─── createPullRequest ────────────────────────────────────────────────────────

  it('createPullRequest POSTs with correct params', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({
      data: {
        number: 42,
        title: 'New PR',
        state: 'open',
        html_url: 'https://github.com/acme/repo/pull/42',
        head: { ref: 'feature' },
        base: { ref: 'main' },
      },
    });

    const ops = createPullRequestsOps(makeCtx());
    const result = await ops.createPullRequest('agent-1', {
      repositoryName: 'repo',
      title: 'New PR',
      head: 'feature',
      base: 'main',
      body: 'Description',
    });

    expect(octokitMock.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/pulls',
      expect.objectContaining({
        title: 'New PR',
        head: 'feature',
        base: 'main',
        body: 'Description',
      }),
    );
    expect(result.number).toBe(42);
  });

  it('createPullRequest returns formatted PR', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({
      data: {
        number: 5,
        title: 'Refactor',
        state: 'open',
        html_url: 'https://github.com/acme/repo/pull/5',
        head: { ref: 'refactor' },
        base: { ref: 'develop' },
      },
    });

    const result = await createPullRequestsOps(makeCtx()).createPullRequest('agent-1', {
      repositoryName: 'repo',
      title: 'Refactor',
      head: 'refactor',
      base: 'develop',
    });

    expect(result).toEqual({
      number: 5,
      title: 'Refactor',
      state: 'open',
      url: 'https://github.com/acme/repo/pull/5',
      head: 'refactor',
      base: 'develop',
    });
  });

  // ─── getPullRequest ───────────────────────────────────────────────────────────

  it('getPullRequest returns full PR details', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({
      data: {
        number: 7,
        title: 'Full PR',
        state: 'open',
        html_url: 'https://github.com/acme/repo/pull/7',
        head: { ref: 'full-branch' },
        base: { ref: 'main' },
        body: 'PR body text',
        merged: false,
        draft: false,
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
      },
    });

    const result = await createPullRequestsOps(makeCtx()).getPullRequest('agent-1', {
      repositoryName: 'repo',
      pullRequestNumber: 7,
    });

    expect(result).toEqual({
      number: 7,
      title: 'Full PR',
      state: 'open',
      url: 'https://github.com/acme/repo/pull/7',
      head: 'full-branch',
      base: 'main',
      body: 'PR body text',
      merged: false,
      draft: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-02T00:00:00Z',
    });
  });

  it('getPullRequest uses pullRequestNumber in request', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({
      data: {
        number: 99,
        title: 'T',
        state: 'open',
        html_url: 'url',
        head: { ref: 'h' },
        base: { ref: 'b' },
        merged: false,
        draft: false,
        created_at: '',
        updated_at: '',
      },
    });

    await createPullRequestsOps(makeCtx()).getPullRequest('agent-1', {
      repositoryName: 'repo',
      pullRequestNumber: 99,
    });

    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}',
      expect.objectContaining({ pull_number: 99 }),
    );
  });

  // ─── listPullRequestComments ───────────────────────────────────────────────────

  it('listPullRequestComments returns formatted comments', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({
      data: [
        {
          id: 101,
          body: 'Looks good!',
          user: { login: 'reviewer' },
          created_at: '2026-02-01T00:00:00Z',
          updated_at: '2026-02-01T00:00:00Z',
        },
        {
          id: 102,
          body: 'Needs more tests',
          user: null,
          created_at: '2026-02-02T00:00:00Z',
          updated_at: '2026-02-02T00:00:00Z',
        },
      ],
    });

    const result = await createPullRequestsOps(makeCtx()).listPullRequestComments('agent-1', {
      repositoryName: 'repo',
      pullRequestNumber: 7,
    });

    expect(result).toEqual([
      {
        id: 101,
        body: 'Looks good!',
        user: 'reviewer',
        createdAt: '2026-02-01T00:00:00Z',
        updatedAt: '2026-02-01T00:00:00Z',
      },
      {
        id: 102,
        body: 'Needs more tests',
        user: null,
        createdAt: '2026-02-02T00:00:00Z',
        updatedAt: '2026-02-02T00:00:00Z',
      },
    ]);
  });

  it('listPullRequestComments caps per_page at 100', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({ data: [] });

    await createPullRequestsOps(makeCtx()).listPullRequestComments('agent-1', {
      repositoryName: 'repo',
      pullRequestNumber: 7,
      limit: 200,
    });

    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
      expect.objectContaining({ per_page: 100 }),
    );
  });

  it('listPullRequestComments uses default limit 100', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({ data: [] });

    await createPullRequestsOps(makeCtx()).listPullRequestComments('agent-1', {
      repositoryName: 'repo',
      pullRequestNumber: 7,
    });

    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/pulls/{pull_number}/comments',
      expect.objectContaining({ per_page: 100 }),
    );
  });

  // ─── updatePullRequest ────────────────────────────────────────────────────────

  it('updatePullRequest PATCHes with provided fields', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({
      data: {
        number: 3,
        title: 'Updated title',
        state: 'closed',
        html_url: 'https://github.com/acme/repo/pull/3',
        head: { ref: 'branch' },
        base: { ref: 'main' },
        body: 'Updated body',
        merged: false,
        draft: false,
        created_at: '',
        updated_at: '',
      },
    });

    const result = await createPullRequestsOps(makeCtx()).updatePullRequest('agent-1', {
      repositoryName: 'repo',
      pullRequestNumber: 3,
      title: 'Updated title',
      state: 'closed',
    });

    expect(octokitMock.request).toHaveBeenCalledWith(
      'PATCH /repos/{owner}/{repo}/pulls/{pull_number}',
      expect.objectContaining({ pull_number: 3, title: 'Updated title', state: 'closed' }),
    );
    expect(result.title).toBe('Updated title');
    expect(result.state).toBe('closed');
  });

  // ─── mergePullRequest ───────────────────────────────────────────────────────────

  it('mergePullRequest PUTs with merge method', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({
      data: { merged: true, message: 'Pull Request successfully merged.', sha: 'abc123' },
    });

    const result = await createPullRequestsOps(makeCtx()).mergePullRequest('agent-1', {
      repositoryName: 'repo',
      pullRequestNumber: 5,
      mergeMethod: 'squash',
    });

    expect(octokitMock.request).toHaveBeenCalledWith(
      'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge',
      expect.objectContaining({ pull_number: 5, merge_method: 'squash' }),
    );
    expect(result).toEqual({
      merged: true,
      message: 'Pull Request successfully merged.',
      sha: 'abc123',
    });
  });

  it('mergePullRequest uses default merge method "merge"', async () => {
    const { createPullRequestsOps } = await import('./pull-requests.js');
    octokitMock.request.mockResolvedValueOnce({
      data: { merged: false, message: 'Not mergeable', sha: 'def456' },
    });

    await createPullRequestsOps(makeCtx()).mergePullRequest('agent-1', {
      repositoryName: 'repo',
      pullRequestNumber: 5,
    });

    expect(octokitMock.request).toHaveBeenCalledWith(
      'PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge',
      expect.objectContaining({ merge_method: 'merge' }),
    );
  });
});
