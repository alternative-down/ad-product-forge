import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { OpsContext } from './context';

const sharedOctokit = { request: vi.fn() };

const makeCtx = (): any => ({
  config: {
    db: vi.fn() as unknown as OpsContext['config']['db'],
    httpServer: vi.fn() as unknown as OpsContext['config']['httpServer'],
    publicBaseUrl: 'https://forge.example.com',
    integrations: vi.fn() as unknown as OpsContext['config']['integrations'],
  },
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
  getInstallationOctokit: vi
    .fn()
    .mockResolvedValue(sharedOctokit as any) as unknown as OpsContext['getInstallationOctokit'],
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
  DEFAULT_GITHUB_APP_MANIFEST_CONFIG: {
    name: 'TestApp',
    url: '',
    callbackUrls: [],
    redirectUrl: '',
    hookAttributes: {},
    callbackURL: '',
  } as any,
  buildManifestEvents: () => ['issues'],
  buildManifestPermissions: () => ({}),
  createAppName: (n: string, id: string) => `${n}-${id}`,
  createGitHubInstallWakeContent:
    vi.fn() as unknown as OpsContext['createGitHubInstallWakeContent'],
  createGitHubWebhookWakeContent:
    vi.fn() as unknown as OpsContext['createGitHubWebhookWakeContent'],
  isGitHubSelfEvent: vi.fn() as unknown as OpsContext['isGitHubSelfEvent'],
  isRecord: vi.fn() as unknown as OpsContext['isRecord'],
  summarizeGitHubEvent: vi.fn() as unknown as OpsContext['summarizeGitHubEvent'],
  normalizeGitHubAppCredentials: vi.fn() as unknown as OpsContext['normalizeGitHubAppCredentials'],
  normalizeManifestConfig: vi.fn() as unknown as OpsContext['normalizeManifestConfig'],
});

describe('createLabelsOps', () => {
  beforeEach(() => sharedOctokit.request.mockReset());

  it('listLabels returns formatted label array', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({
      data: [
        { name: 'bug', description: 'Bug report', color: 'ff0000', default: false },
        { name: 'enhancement', description: null, color: '00ff00', default: true },
      ],
    });
    const labels = createLabelsOps(makeCtx());
    const result = await labels.listLabels('agent-1', { repositoryName: 'my-repo' });
    expect(result).toEqual([
      { name: 'bug', description: 'Bug report', color: 'ff0000', default: false },
      { name: 'enhancement', description: null, color: '00ff00', default: true },
    ]);
  });

  it('listLabels respects limit parameter', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({ data: [] });
    const labels = createLabelsOps(makeCtx());
    await labels.listLabels('agent-1', { repositoryName: 'repo', limit: 5 });
    expect(sharedOctokit.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/labels',
      expect.objectContaining({ per_page: 5 }),
    );
  });

  it('listLabels uses defaultOwner when owner not provided', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({ data: [] });
    const labels = createLabelsOps(makeCtx());
    await labels.listLabels('agent-1', { repositoryName: 'my-repo' });
    expect(sharedOctokit.request).toHaveBeenCalledWith(
      'GET /repos/{owner}/{repo}/labels',
      expect.objectContaining({ owner: 'acme' }),
    );
  });
});

describe('createLabelsOps — createLabel', () => {
  beforeEach(() => sharedOctokit.request.mockReset());

  it('createLabel POSTs with labelName and color', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({
      data: {
        name: 'priority-high',
        description: 'High priority',
        color: 'd73a4a',
        default: false,
      },
    });
    const ctx = makeCtx();
    const labels = createLabelsOps(ctx);
    await labels.createLabel('agent-1', {
      repositoryName: 'repo',
      labelName: 'priority-high',
      color: 'd73a4a',
    });
    expect(sharedOctokit.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/labels',
      expect.objectContaining({
        name: 'priority-high',
        color: 'd73a4a',
      }),
    );
  });

  it('createLabel includes description when provided', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({
      data: { name: 'bug', description: 'Bug report label', color: 'ff0000', default: false },
    });
    const ctx = makeCtx();
    const labels = createLabelsOps(ctx);
    await labels.createLabel('agent-1', {
      repositoryName: 'repo',
      labelName: 'bug',
      color: 'ff0000',
      description: 'Bug report label',
    });
    expect(sharedOctokit.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/labels',
      expect.objectContaining({
        description: 'Bug report label',
      }),
    );
  });

  it('createLabel returns formatted label', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({
      data: { name: 'enhancement', description: null, color: '00ff00', default: true },
    });
    const ctx = makeCtx();
    const labels = createLabelsOps(ctx);
    const result = await labels.createLabel('agent-1', {
      repositoryName: 'repo',
      labelName: 'enhancement',
      color: '00ff00',
    });
    expect(result).toEqual({
      name: 'enhancement',
      description: null,
      color: '00ff00',
      default: true,
    });
  });
});

describe('createLabelsOps — updateLabel', () => {
  beforeEach(() => sharedOctokit.request.mockReset());

  it('updateLabel PATCHes with new fields', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({
      data: { name: 'new-name', description: 'Updated desc', color: '0000ff', default: false },
    });
    const ctx = makeCtx();
    const labels = createLabelsOps(ctx);
    await labels.updateLabel('agent-1', {
      repositoryName: 'repo',
      labelName: 'old-name',
      newLabelName: 'new-name',
      color: '0000ff',
    });
    expect(sharedOctokit.request).toHaveBeenCalledWith(
      'PATCH /repos/{owner}/{repo}/labels/{name}',
      expect.objectContaining({
        name: 'old-name',
        new_name: 'new-name',
        color: '0000ff',
      }),
    );
  });

  it('updateLabel returns formatted label', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({
      data: { name: 'updated', description: 'Updated', color: 'abc123', default: false },
    });
    const ctx = makeCtx();
    const labels = createLabelsOps(ctx);
    const result = await labels.updateLabel('agent-1', {
      repositoryName: 'repo',
      labelName: 'updated',
      description: 'Updated',
    });
    expect(result.description).toBe('Updated');
  });
});

describe('createLabelsOps — deleteLabel', () => {
  beforeEach(() => sharedOctokit.request.mockReset());

  it('deleteLabel DELETE returns {success:true}', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({ status: 204 });
    const ctx = makeCtx();
    const labels = createLabelsOps(ctx);
    const result = await labels.deleteLabel('agent-1', {
      repositoryName: 'repo',
      labelName: 'obsolete',
    });
    expect(sharedOctokit.request).toHaveBeenCalledWith(
      'DELETE /repos/{owner}/{repo}/labels/{name}',
      {
        owner: 'acme',
        repo: 'repo',
        name: 'obsolete',
      },
    );
    expect(result).toEqual({ success: true });
  });
});

describe('createLabelsOps — addIssueLabels', () => {
  beforeEach(() => sharedOctokit.request.mockReset());

  it('addIssueLabels POSTs labels array', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({
      data: [{ name: 'bug', description: null, color: 'ff0000', default: false }],
    });
    const ctx = makeCtx();
    const labels = createLabelsOps(ctx);
    await labels.addIssueLabels('agent-1', {
      repositoryName: 'repo',
      issueNumber: 3,
      labels: ['bug', 'high-priority'],
    });
    expect(sharedOctokit.request).toHaveBeenCalledWith(
      'POST /repos/{owner}/{repo}/issues/{issue_number}/labels',
      expect.objectContaining({
        issue_number: 3,
        labels: ['bug', 'high-priority'],
      }),
    );
  });

  it('addIssueLabels returns formatted labels', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({
      data: [{ name: 'enhancement', description: 'Feature', color: '00ff00', default: true }],
    });
    const ctx = makeCtx();
    const labels = createLabelsOps(ctx);
    const result = await labels.addIssueLabels('agent-1', {
      repositoryName: 'repo',
      issueNumber: 5,
      labels: ['enhancement'],
    });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('enhancement');
  });
});

describe('createLabelsOps — removeIssueLabels', () => {
  beforeEach(() => sharedOctokit.request.mockReset());

  it('removeIssueLabels DELETEs with labels as comma-separated string', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({ status: 200 });
    const ctx = makeCtx();
    const labels = createLabelsOps(ctx);
    const result = await labels.removeIssueLabels('agent-1', {
      repositoryName: 'repo',
      issueNumber: 8,
      labels: ['wontfix', 'bug'],
    });
    expect(sharedOctokit.request).toHaveBeenCalledWith(
      'DELETE /repos/{owner}/{repo}/issues/{issue_number}/labels',
      {
        owner: 'acme',
        repo: 'repo',
        issue_number: 8,
        labels: 'wontfix,bug',
      },
    );
    expect(result).toEqual({ success: true });
  });
});
