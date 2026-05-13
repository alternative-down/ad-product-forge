import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OpsContext } from './context';

const octokitMock = vi.hoisted(() => ({ request: vi.fn() }));

function makeCtx(): any {
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
    DEFAULT_GITHUB_APP_MANIFEST_CONFIG: { name: 'TestApp', url: '', callbackUrls: [], redirectUrl: '', hookAttributes: {}, callbackURL: '' } as any,
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

describe('createMilestonesOps — createMilestone', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('createMilestone POSTs with correct fields', async () => {
    const { createMilestonesOps } = await import('./milestones.js');
    octokitMock.request.mockResolvedValue({
      data: { number: 1, title: 'v1.0', description: 'Release v1.0', state: 'open', due_on: null, open_issues: 0, closed_issues: 0 },
    });
    const ctx = makeCtx();
    const milestones = createMilestonesOps(ctx);
    await milestones.createMilestone('agent-1', { repositoryName: 'repo', title: 'v1.0', description: 'Release v1.0' });
    expect(octokitMock.request).toHaveBeenCalledWith('POST /repos/{owner}/{repo}/milestones', expect.objectContaining({
      title: 'v1.0',
      description: 'Release v1.0',
    }));
  });

  it('createMilestone includes state and dueOn when provided', async () => {
    const { createMilestonesOps } = await import('./milestones.js');
    octokitMock.request.mockResolvedValue({
      data: { number: 2, title: 'v2.0', description: null, state: 'open', due_on: '2025-12-31T00:00:00Z', open_issues: 0, closed_issues: 0 },
    });
    const ctx = makeCtx();
    const milestones = createMilestonesOps(ctx);
    await milestones.createMilestone('agent-1', { repositoryName: 'repo', title: 'v2.0', state: 'open', dueOn: '2025-12-31T00:00:00Z' });
    expect(octokitMock.request).toHaveBeenCalledWith('POST /repos/{owner}/{repo}/milestones', expect.objectContaining({
      state: 'open',
      due_on: '2025-12-31T00:00:00Z',
    }));
  });

  it('createMilestone returns formatted milestone', async () => {
    const { createMilestonesOps } = await import('./milestones.js');
    octokitMock.request.mockResolvedValue({
      data: { number: 3, title: 'v3.0', description: 'Future release', state: 'open', due_on: null, open_issues: 5, closed_issues: 0 },
    });
    const ctx = makeCtx();
    const milestones = createMilestonesOps(ctx);
    const result = await milestones.createMilestone('agent-1', { repositoryName: 'repo', title: 'v3.0' });
    expect(result).toEqual({ number: 3, title: 'v3.0', description: 'Future release', state: 'open', dueOn: null });
  });
});

describe('createMilestonesOps — updateMilestone', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('updateMilestone PATCHes with provided fields', async () => {
    const { createMilestonesOps } = await import('./milestones.js');
    octokitMock.request.mockResolvedValue({
      data: { number: 1, title: 'Updated title', description: 'New desc', state: 'closed', due_on: null, open_issues: 0, closed_issues: 1 },
    });
    const ctx = makeCtx();
    const milestones = createMilestonesOps(ctx);
    await milestones.updateMilestone('agent-1', { repositoryName: 'repo', milestoneNumber: 1, title: 'Updated title', state: 'closed' });
    expect(octokitMock.request).toHaveBeenCalledWith('PATCH /repos/{owner}/{repo}/milestones/{milestone_number}', expect.objectContaining({
      milestone_number: 1,
      title: 'Updated title',
      state: 'closed',
    }));
  });

  it('updateMilestone returns formatted milestone', async () => {
    const { createMilestonesOps } = await import('./milestones.js');
    octokitMock.request.mockResolvedValue({
      data: { number: 4, title: 'v4.0', description: null, state: 'open', due_on: null, open_issues: 0, closed_issues: 0 },
    });
    const ctx = makeCtx();
    const milestones = createMilestonesOps(ctx);
    const result = await milestones.updateMilestone('agent-1', { repositoryName: 'repo', milestoneNumber: 4 });
    expect(result).toEqual({ number: 4, title: 'v4.0', description: null, state: 'open', dueOn: null });
  });
});

describe('createMilestonesOps — deleteMilestone', () => {
  beforeEach(() => octokitMock.request.mockReset());

  it('deleteMilestone DELETE returns {success:true}', async () => {
    const { createMilestonesOps } = await import('./milestones.js');
    octokitMock.request.mockResolvedValue({ status: 204 });
    const ctx = makeCtx();
    const milestones = createMilestonesOps(ctx);
    const result = await milestones.deleteMilestone('agent-1', { repositoryName: 'repo', milestoneNumber: 2 });
    expect(octokitMock.request).toHaveBeenCalledWith('DELETE /repos/{owner}/{repo}/milestones/{milestone_number}', {
      owner: 'acme',
      repo: 'repo',
      milestone_number: 2,
    });
    expect(result).toEqual({ success: true });
  });
});

