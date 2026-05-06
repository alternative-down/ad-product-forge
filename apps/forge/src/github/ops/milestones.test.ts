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

describe('createMilestonesOps', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('listMilestones returns formatted milestones', async () => {
    const { createMilestonesOps } = await import('./milestones.js');
    octokitMock.request.mockResolvedValueOnce({ data: [
      { number: 1, title: 'v1.0', description: 'Version 1', state: 'open', due_on: '2026-01-01', open_issues: 3, closed_issues: 0 },
      { number: 2, title: 'v2.0', description: null, state: 'closed', due_on: null, open_issues: 0, closed_issues: 10 },
    ]});
    const ms = createMilestonesOps(makeCtx());
    const result = await ms.listMilestones('agent-1', { repositoryName: 'my-repo' });
    expect(result).toEqual([
      { number: 1, title: 'v1.0', description: 'Version 1', state: 'open', dueOn: '2026-01-01', openIssues: 3, closedIssues: 0 },
      { number: 2, title: 'v2.0', description: null, state: 'closed', dueOn: null, openIssues: 0, closedIssues: 10 },
    ]);
  });

  it('listMilestones uses state default of open', async () => {
    const { createMilestonesOps } = await import('./milestones.js');
    octokitMock.request.mockResolvedValueOnce({ data: [] });
    const ms = createMilestonesOps(makeCtx());
    await ms.listMilestones('agent-1', { repositoryName: 'my-repo' });
    expect(octokitMock.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/milestones', expect.objectContaining({ state: 'open' }));
  });

  it('listMilestones respects state parameter', async () => {
    const { createMilestonesOps } = await import('./milestones.js');
    octokitMock.request.mockResolvedValueOnce({ data: [] });
    const ms = createMilestonesOps(makeCtx());
    await ms.listMilestones('agent-1', { repositoryName: 'my-repo', state: 'closed' });
    expect(octokitMock.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/milestones', expect.objectContaining({ state: 'closed' }));
  });

  it('listMilestones respects limit parameter', async () => {
    const { createMilestonesOps } = await import('./milestones.js');
    octokitMock.request.mockResolvedValueOnce({ data: [] });
    const ms = createMilestonesOps(makeCtx());
    await ms.listMilestones('agent-1', { repositoryName: 'my-repo', limit: 50 });
    expect(octokitMock.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/milestones', expect.objectContaining({ per_page: 50 }));
  });
});
