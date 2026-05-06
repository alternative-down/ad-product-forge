import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpsContext } from './context';

// Use vi.hoisted so it's initialized before mocks are processed
const octokitMock = vi.hoisted(() => ({ request: vi.fn() }));

function makeCtx(): OpsContext {
  return {
    config: { db: vi.fn() as unknown as OpsContext['config']['db'], httpServer: vi.fn() as unknown as OpsContext['config']['httpServer'], publicBaseUrl: 'https://forge.example.com', integrations: vi.fn() as unknown as OpsContext['config']['integrations'] },
    notifications: vi.fn() as unknown as OpsContext['notifications'],
    routeCleanups: new Map(),
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
    getInstallationOctokit: vi.fn().mockResolvedValue(octokitMock as any) as unknown as OpsContext['getInstallationOctokit'],
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
    normalizeAssignees: (a: string[]) => a,
    toIssueSummary: vi.fn().mockImplementation((p: unknown) => ({ id: (p as { id: number }).id, title: (p as { title: string }).title })) as unknown as OpsContext['toIssueSummary'],
    toIssueDetails: vi.fn().mockImplementation((p: unknown) => ({ id: (p as { id: number }).id, body: '' })) as unknown as OpsContext['toIssueDetails'],
    DEFAULT_GITHUB_APP_MANIFEST_CONFIG: { name: 'TestApp', url: '', callbackUrls: [], redirectUrl: '', hookAttributes: {}, callbackURL: '' },
    buildManifestEvents: () => ['issues'],
    buildManifestPermissions: () => ({}),
    createAppName: (n: string, id: string) => `${n}-${id}`,
    createGitHubInstallWakeContent: vi.fn() as unknown as OpsContext['createGitHubInstallWakeContent'],
    createGitHubWebhookWakeContent: vi.fn() as unknown as OpsContext['createGitHubWebhookWakeContent'],
    isGitHubSelfEvent: vi.fn() as unknown as OpsContext['isGitHubSelfEvent'],
    isRecord: vi.fn() as unknown as OpsContext['isRecord'],
    summarizeGitHubEvent: vi.fn() as unknown as OpsContext['summarizeGitHubEvent'],
    normalizeGitHubAppCredentials: vi.fn() as unknown as OpsContext['normalizeGitHubAppCredentials'],
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
    expect(octokitMock.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/issues', expect.objectContaining({ state: 'open' }));
  });

  it('listIssues respects state parameter', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ data: [] });
    const issues = createIssuesOps(makeCtx());
    await issues.listIssues('agent-1', { repositoryName: 'my-repo', state: 'closed' });
    expect(octokitMock.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/issues', expect.objectContaining({ state: 'closed' }));
  });

  it('listIssues respects labels parameter', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ data: [] });
    const issues = createIssuesOps(makeCtx());
    await issues.listIssues('agent-1', { repositoryName: 'my-repo', labels: ['bug', 'high-priority'] });
    expect(octokitMock.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/issues', expect.objectContaining({ labels: 'bug,high-priority' }));
  });

  it('listIssues caps limit at 100', async () => {
    const { createIssuesOps } = await import('./issues.js');
    octokitMock.request.mockResolvedValue({ data: [] });
    const issues = createIssuesOps(makeCtx());
    await issues.listIssues('agent-1', { repositoryName: 'my-repo', limit: 200 });
    expect(octokitMock.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/issues', expect.objectContaining({ per_page: 100 }));
  });

  // TEST FILTER: check that toIssueSummary was called only with non-PR items
  it('listIssues filters out pull_requests from the response', async () => {
    const { createIssuesOps } = await import('./issues.js');
    const testData = [
      { id: 1, number: 101, title: 'Bug fix', state: 'open' }, // no pull_request key at all
      { id: 2, number: 102, title: 'Feature PR', state: 'open', pull_request: { url: 'https://github.com/...' } },
      { id: 3, number: 103, title: 'Another issue', state: 'open' }, // no pull_request key at all
    ];
    octokitMock.request.mockResolvedValue({ data: testData });

    // Create a fresh ctx with a tracking toIssueSummary
    const trackingToIssue = vi.fn().mockImplementation((p: unknown) => ({ id: (p as { id: number }).id, title: (p as { title: string }).title }));
    const ctx = makeCtx();
    ctx.toIssueSummary = trackingToIssue as unknown as OpsContext['toIssueSummary'];

    const issues = createIssuesOps(ctx);
    const result = await issues.listIssues('agent-1', { repositoryName: 'my-repo' });

    // The filter uses 'pull_request' in issue to detect the key
    // Items with NO pull_request key pass the filter
    // Items with pull_request={...} are excluded
    expect(result).toHaveLength(2);
    expect(result.map((r: unknown) => (r as {id:number}).id)).toEqual([1, 3]);
  });
});
