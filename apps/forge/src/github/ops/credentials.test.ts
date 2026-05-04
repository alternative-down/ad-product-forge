import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpsContext } from './context.js';
import type { GitHubAppCredentials } from '../types.js';

const sharedDb = { query: { agentProviders: { findFirst: vi.fn() } } };

const baseCtx = (): OpsContext => ({
  config: { db: sharedDb as unknown as OpsContext['config']['db'], httpServer: vi.fn() as unknown as OpsContext['config']['httpServer'], publicBaseUrl: 'https://forge.example.com', integrations: vi.fn() as unknown as OpsContext['config']['integrations'] },
  notifications: vi.fn() as unknown as OpsContext['notifications'],
  routeCleanups: new Map(),
  GITHUB_PROVIDER_TYPE: 'github',
  and: vi.fn().mockImplementation((a: unknown) => a) as unknown as OpsContext['and'],
  eq: vi.fn().mockImplementation((a: unknown, b: unknown) => ({ type: 'eq', a, b })) as unknown as OpsContext['eq'],
  agentProviders: vi.fn() as unknown as OpsContext['agentProviders'],
  agents: vi.fn() as unknown as OpsContext['agents'],
  createId: () => 'test-id',
  nanoid: () => 'nano-id',
  forgeDebug: vi.fn(),
  getGlobalConfig: vi.fn() as unknown as OpsContext['getGlobalConfig'],
  getDefaultOwner: vi.fn().mockResolvedValue('acme') as unknown as OpsContext['getDefaultOwner'],
  getInstallationOctokit: vi.fn() as unknown as OpsContext['getInstallationOctokit'],
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

describe('createCredentialsOps', () => {
  beforeEach(() => {
    sharedDb.query.agentProviders.findFirst.mockReset();
    vi.clearAllMocks();
  });

  it('getCredentials returns null when no provider found', async () => {
    const { createCredentialsOps } = await import('./credentials.js');
    sharedDb.query.agentProviders.findFirst.mockResolvedValueOnce(null);
    const ops = createCredentialsOps(baseCtx());
    const result = await ops.getCredentials('unknown-agent');
    expect(result).toBeNull();
  });

  it('getCredentials returns parsed credentials when provider found', async () => {
    const { createCredentialsOps } = await import('./credentials.js');
    const creds: GitHubAppCredentials = {
      status: 'active', manifestConfig: { name: 'T', url: '', callbackUrls: [], redirectUrl: '', hookAttributes: {}, callbackURL: '' }, encryptedCredentials: 'x',
    };
    sharedDb.query.agentProviders.findFirst.mockResolvedValueOnce({ encryptedCredentials: 'encrypted-value' });
    const ctx = baseCtx();
    ctx.parseCredentials = vi.fn().mockReturnValue(creds) as unknown as OpsContext['parseCredentials'];
    const ops = createCredentialsOps(ctx);
    const result = await ops.getCredentials('agent-1');
    expect(result).toEqual(creds);
  });

  it('getActiveCredentials throws when credentials not active', async () => {
    const { createCredentialsOps } = await import('./credentials.js');
    const pendingCreds: GitHubAppCredentials = {
      status: 'pending', manifestConfig: { name: 'T', url: '', callbackUrls: [], redirectUrl: '', hookAttributes: {}, callbackURL: '' }, encryptedCredentials: 'x',
    };
    sharedDb.query.agentProviders.findFirst.mockResolvedValueOnce({ encryptedCredentials: 'e' });
    const ctx = baseCtx();
    ctx.parseCredentials = vi.fn().mockReturnValue(pendingCreds) as unknown as OpsContext['parseCredentials'];
    const ops = createCredentialsOps(ctx);
    await expect(ops.getActiveCredentials('agent-2')).rejects.toThrow('GitHub App not active for agent agent-2');
  });

  it('getActiveCredentials returns credentials when active', async () => {
    const { createCredentialsOps } = await import('./credentials.js');
    const activeCreds: GitHubAppCredentials = {
      status: 'active', appSlug: 'my-app', manifestConfig: { name: 'T', url: '', callbackUrls: [], redirectUrl: '', hookAttributes: {}, callbackURL: '' }, encryptedCredentials: 'x',
    };
    sharedDb.query.agentProviders.findFirst.mockResolvedValueOnce({ encryptedCredentials: 'e' });
    const ctx = baseCtx();
    ctx.parseCredentials = vi.fn().mockReturnValue(activeCreds) as unknown as OpsContext['parseCredentials'];
    const ops = createCredentialsOps(ctx);
    const result = await ops.getActiveCredentials('agent-3');
    expect(result.status).toBe('active');
    expect(result.appSlug).toBe('my-app');
  });
});
