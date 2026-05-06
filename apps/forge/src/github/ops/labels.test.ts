import { describe, expect, it, vi } from 'vitest';
import type { OpsContext } from './context';

const sharedOctokit = { request: vi.fn() };

const makeCtx = (): OpsContext => ({
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
  getInstallationOctokit: vi.fn().mockResolvedValue(sharedOctokit as any) as unknown as OpsContext['getInstallationOctokit'],
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
});

describe('createLabelsOps', () => {
  beforeEach(() => sharedOctokit.request.mockReset());

  it('listLabels returns formatted label array', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({ data: [
      { name: 'bug', description: 'Bug report', color: 'ff0000', default: false },
      { name: 'enhancement', description: null, color: '00ff00', default: true },
    ]});
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
    expect(sharedOctokit.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/labels', expect.objectContaining({ per_page: 5 }));
  });

  it('listLabels uses defaultOwner when owner not provided', async () => {
    const { createLabelsOps } = await import('./labels.js');
    sharedOctokit.request.mockResolvedValue({ data: [] });
    const labels = createLabelsOps(makeCtx());
    await labels.listLabels('agent-1', { repositoryName: 'my-repo' });
    expect(sharedOctokit.request).toHaveBeenCalledWith('GET /repos/{owner}/{repo}/labels', expect.objectContaining({ owner: 'acme' }));
  });
});
