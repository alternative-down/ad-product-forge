import { describe, expect, it, vi } from 'vitest';
import type { OpsContext } from './context';

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
    getGlobalConfig: vi.fn().mockResolvedValue({ organization: 'acme', appHomeUrl: 'https://github.com/apps/test' }) as unknown as OpsContext['getGlobalConfig'],
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
    toIssueSummary: vi.fn() as unknown as OpsContext['toIssueSummary'],
    toIssueDetails: vi.fn() as unknown as OpsContext['toIssueDetails'],
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

describe('createReposOps', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('listRepositories returns formatted repository list', async () => {
    const { createReposOps } = await import('./repos.js');
    octokitMock.request.mockResolvedValueOnce({ data: { repositories: [
      { id: 1, name: 'repo-a', full_name: 'acme/repo-a', private: false, default_branch: 'main', html_url: 'https://github.com/acme/repo-a' },
      { id: 2, name: 'repo-b', full_name: 'acme/repo-b', private: true, default_branch: 'develop', html_url: 'https://github.com/acme/repo-b' },
    ]}});
    const repos = createReposOps(makeCtx());
    const result = await repos.listRepositories('agent-1');
    expect(result).toEqual([
      { id: 1, name: 'repo-a', fullName: 'acme/repo-a', private: false, defaultBranch: 'main', url: 'https://github.com/acme/repo-a' },
      { id: 2, name: 'repo-b', fullName: 'acme/repo-b', private: true, defaultBranch: 'develop', url: 'https://github.com/acme/repo-b' },
    ]);
  });

  it('createRepository POSTs to org endpoint', async () => {
    const { createReposOps } = await import('./repos.js');
    octokitMock.request.mockResolvedValueOnce({ data: { id: 99, name: 'new-repo', full_name: 'acme/new-repo', html_url: 'https://github.com/acme/new-repo' } });
    const repos = createReposOps(makeCtx());
    const result = await repos.createRepository('agent-1', { name: 'new-repo', description: 'A new repo', private: false });
    expect(octokitMock.request).toHaveBeenCalledWith('POST /orgs/{org}/repos', expect.objectContaining({ org: 'acme', name: 'new-repo', description: 'A new repo', private: false }));
    expect(result.id).toBe(99);
  });
});
