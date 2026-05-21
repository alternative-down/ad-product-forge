import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpsContext } from './context';

// Use vi.hoisted so it's initialized before mocks are processed
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
    getGlobalConfig: vi.fn() as unknown as OpsContext['getGlobalConfig'],
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
    toIssueSummary: vi.fn().mockImplementation((p: unknown) => ({
      id: (p as { id: number }).id,
      title: (p as { title: string }).title,
    })) as unknown as OpsContext['toIssueSummary'],
    toIssueDetails: vi.fn().mockImplementation((p: unknown) => ({
      id: (p as { id: number }).id,
      body: '',
    })) as unknown as OpsContext['toIssueDetails'],
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

describe('createIssuesOps', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('listIssues uses state default of open', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ data: [] });
    const issues = createIssuesOps(makeCtx());
    await issues.listIssues('agent-1', { repositoryName: 'my-repo' });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/issues',
      expect.objectContaining({ state: 'open' }),
    );
  });

  it('listIssues respects state parameter', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ data: [] });
    const issues = createIssuesOps(makeCtx());
    await issues.listIssues('agent-1', { repositoryName: 'my-repo', state: 'closed' });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/issues',
      expect.objectContaining({ state: 'closed' }),
    );
  });

  it('listIssues respects labels parameter', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ data: [] });
    const issues = createIssuesOps(makeCtx());
    await issues.listIssues('agent-1', {
      repositoryName: 'my-repo',
      labels: ['bug', 'high-priority'],
    });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/issues',
      expect.objectContaining({ labels: 'bug,high-priority' }),
    );
  });

  it('listIssues caps limit at 100', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ data: [] });
    const issues = createIssuesOps(makeCtx());
    await issues.listIssues('agent-1', { repositoryName: 'my-repo', limit: 200 });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/issues',
      expect.objectContaining({ per_page: 100 }),
    );
  });

  // TEST FILTER: check that toIssueSummary was called only with non-PR items
  it('listIssues filters out pull_requests from the response', async () => {
    const { createIssuesOps } = await import('./issues.js');
    const testData = [
      { id: 1, number: 101, title: 'Bug fix', state: 'open' }, // no pull_request key at all
      {
        id: 2,
        number: 102,
        title: 'Feature PR',
        state: 'open',
        pull_request: { url: 'https://github.com/...' },
      },
      { id: 3, number: 103, title: 'Another issue', state: 'open' }, // no pull_request key at all
    ];
    octokitMock.request.mockResolvedValue({ data: testData });

    // Create a fresh ctx with a tracking toIssueSummary
    const trackingToIssue = vi.fn().mockImplementation((p: unknown) => ({
      id: (p as { id: number }).id,
      title: (p as { title: string }).title,
    }));
    const ctx = makeCtx();
    ctx.toIssueSummary = trackingToIssue as unknown as OpsContext['toIssueSummary'];

    const issues = createIssuesOps(ctx);
    const result = await issues.listIssues('agent-1', { repositoryName: 'my-repo' });

    // The filter uses 'pull_request' in issue to detect the key
    // Items with NO pull_request key pass the filter
    // Items with pull_request={...} are excluded
    expect(result).toHaveLength(2);
    expect(result.map((r: unknown) => (r as { id: number }).id)).toEqual([1, 3]);
  });
});

describe('createIssuesOps — getIssue', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('getIssue calls correct endpoint with owner from getDefaultOwner', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({
      data: { id: 42, number: 10, title: 'Bug', body: 'desc', state: 'open' },
    });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    const result = await issues.getIssue('agent-1', {
      owner: 'my-org',
      repositoryName: 'my-repo',
      issueNumber: 10,
    });
    // getDefaultOwner in mock always returns 'acme' (ignores input)
    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/issues/{issue_number}',
      {
        owner: 'acme',
        repo: 'my-repo',
        issue_number: 10,
      },
    );
    expect(result).toEqual({ id: 42, body: '' });
  });

  it('getIssue delegates to toIssueDetails', async () => {
    const { createIssuesOps } = await import('./issues.js');
    const mockData = {
      id: 99,
      number: 5,
      title: 'Feature',
      body: 'Long description',
      state: 'open',
    };
    octokitMock.request.mockResolvedValue({ data: mockData });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    await issues.getIssue('agent-1', { repositoryName: 'repo', issueNumber: 5 });
    expect(ctx.toIssueDetails).toHaveBeenCalledWith(mockData);
  });
});

describe('createIssuesOps — createIssue', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('createIssue POSTs with correct fields', async () => {
    const { createIssuesOps } = await import('./issues.js');
    const createdData = { id: 1, number: 42, title: 'New issue', body: 'Details', state: 'open' };
    octokitMock.request.mockResolvedValue({ data: createdData });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    await issues.createIssue('agent-1', {
      repositoryName: 'repo',
      title: 'New issue',
      body: 'Details',
    });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/issues',
      expect.objectContaining({
        title: 'New issue',
        body: 'Details',
      }),
    );
  });

  it('createIssue passes labels and assignees', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({
      data: { id: 1, number: 1, title: 'T', state: 'open' },
    });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    await issues.createIssue('agent-1', {
      repositoryName: 'repo',
      title: 'T',
      labels: ['bug'],
      assignees: ['user1'],
    });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/issues',
      expect.objectContaining({
        labels: ['bug'],
        assignees: ['user1'],
      }),
    );
  });

  it('createIssue delegates to toIssueDetails', async () => {
    const { createIssuesOps } = await import('./issues.js');
    const mockData = { id: 7, number: 7, title: 'Test', body: 'Body', state: 'open' };
    octokitMock.request.mockResolvedValue({ data: mockData });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    const result = await issues.createIssue('agent-1', { repositoryName: 'repo', title: 'Test' });
    expect(ctx.toIssueDetails).toHaveBeenCalledWith(mockData);
  });
});

describe('createIssuesOps — updateIssue', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('updateIssue PATCHes with provided fields', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({
      data: { id: 1, number: 5, title: 'Updated', state: 'open' },
    });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    await issues.updateIssue('agent-1', {
      repositoryName: 'repo',
      issueNumber: 5,
      title: 'Updated',
      state: 'closed',
    });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'PATCH /repos/{owner}/{repo}/issues/{issue_number}',
      expect.objectContaining({
        issue_number: 5,
        title: 'Updated',
        state: 'closed',
      }),
    );
  });

  it('updateIssue omits undefined fields from PATCH body', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ data: { id: 1, number: 5, state: 'open' } });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    await issues.updateIssue('agent-1', {
      repositoryName: 'repo',
      issueNumber: 5,
      body: 'New body',
    });
    const call = octokitMock.request.mock.calls[0][1];
    expect(call.title).toBeUndefined();
    expect(call.body).toBe('New body');
    expect(call.state).toBeUndefined();
  });

  it('updateIssue delegates to toIssueDetails', async () => {
    const { createIssuesOps } = await import('./issues.js');
    const mockData = { id: 10, number: 10, title: 'Patched', state: 'open' };
    octokitMock.request.mockResolvedValue({ data: mockData });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    const result = await issues.updateIssue('agent-1', {
      repositoryName: 'repo',
      issueNumber: 10,
      title: 'Patched',
    });
    expect(ctx.toIssueDetails).toHaveBeenCalledWith(mockData);
  });
});

describe('createIssuesOps — closeIssue / reopenIssue', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('closeIssue delegates to updateIssue with state closed', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ data: { id: 1, number: 3, state: 'closed' } });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    await issues.closeIssue('agent-1', { repositoryName: 'repo', issueNumber: 3 });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'PATCH /repos/{owner}/{repo}/issues/{issue_number}',
      expect.objectContaining({
        issue_number: 3,
        state: 'closed',
      }),
    );
  });

  it('reopenIssue delegates to updateIssue with state open', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ data: { id: 2, number: 4, state: 'open' } });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    await issues.reopenIssue('agent-1', { repositoryName: 'repo', issueNumber: 4 });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'PATCH /repos/{owner}/{repo}/issues/{issue_number}',
      expect.objectContaining({
        issue_number: 4,
        state: 'open',
      }),
    );
  });
});

describe('createIssuesOps — listIssueComments', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('listIssueComments calls GET with correct params', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ data: [] });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    await issues.listIssueComments('agent-1', {
      owner: 'org',
      repositoryName: 'repo',
      issueNumber: 7,
    });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {
        owner: 'acme',
        repo: 'repo',
        issue_number: 7,
        per_page: 100,
      },
    );
  });

  it('listIssueComments returns formatted comment objects', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({
      data: [
        {
          id: 100,
          body: 'A comment',
          user: { login: 'alice' },
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T00:00:00Z',
        },
      ],
    });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    const result = await issues.listIssueComments('agent-1', {
      repositoryName: 'repo',
      issueNumber: 7,
    });
    expect(result).toEqual([
      {
        id: 100,
        body: 'A comment',
        author: 'alice',
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-02T00:00:00Z',
      },
    ]);
  });
});

describe('createIssuesOps — getIssueComment', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('getIssueComment calls correct endpoint', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({
      data: {
        id: 5,
        html_url: 'https://github.com/org/repo/issues/1#issuecomment-5',
        body: 'Test',
        user: { login: 'bob' },
        created_at: '2024-01-01',
        updated_at: '2024-01-02',
      },
    });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    const result = await issues.getIssueComment('agent-1', {
      repositoryName: 'repo',
      issueNumber: 1,
      commentId: 5,
    });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/issues/comments/{comment_id}',
      {
        owner: 'acme',
        repo: 'repo',
        issue_number: 1,
        comment_id: 5,
      },
    );
    expect(result).toEqual({
      id: 5,
      url: 'https://github.com/org/repo/issues/1#issuecomment-5',
      body: 'Test',
      author: 'bob',
      createdAt: '2024-01-01',
      updatedAt: '2024-01-02',
    });
  });
});

describe('createIssuesOps — createIssueComment', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('createIssueComment POSTs with body and returns formatted comment', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({
      data: {
        id: 99,
        html_url: 'https://github.com/org/repo/issues/5#issuecomment-99',
        body: 'Hello world',
        user: { login: 'carol' },
        created_at: '2024-03-01',
        updated_at: '2024-03-01',
      },
    });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    const result = await issues.createIssueComment('agent-1', {
      repositoryName: 'repo',
      issueNumber: 5,
      body: 'Hello world',
    });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/comments',
      {
        owner: 'acme',
        repo: 'repo',
        issue_number: 5,
        body: 'Hello world',
      },
    );
    expect(result.body).toBe('Hello world');
    expect(result.author).toBe('carol');
  });
});

describe('createIssuesOps — updateIssueComment', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('updateIssueComment PATCHes with new body', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({
      data: {
        id: 77,
        html_url: 'https://github.com/org/repo/issues/1#issuecomment-77',
        body: 'Updated text',
        user: { login: 'dave' },
        created_at: '2024-01-01',
        updated_at: '2024-01-05',
      },
    });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    const result = await issues.updateIssueComment('agent-1', {
      repositoryName: 'repo',
      commentId: 77,
      body: 'Updated text',
    });
    // owner comes from getDefaultOwner which returns 'acme' in the mock
    expect(octokitMock.request).toHaveBeenCalledWith(
      'PATCH /repos/{owner}/{repo}/issues/comments/{comment_id}',
      {
        owner: 'acme',
        repo: 'repo',
        comment_id: 77,
        body: 'Updated text',
      },
    );
    expect(result.body).toBe('Updated text');
  });
});

describe('createIssuesOps — deleteIssueComment', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('deleteIssueComment DELETE returns {success:true}', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ status: 204 });
    const ctx = makeCtx();
    const issues = createIssuesOps(ctx);
    const result = await issues.deleteIssueComment('agent-1', {
      repositoryName: 'repo',
      commentId: 55,
    });
    expect(octokitMock.request).toHaveBeenCalledWith(
      'DELETE /repos/{owner}/{repo}/issues/comments/{comment_id}',
      {
        owner: 'acme',
        repo: 'repo',
        comment_id: 55,
      },
    );
    expect(result).toEqual({ success: true });
  });
});
