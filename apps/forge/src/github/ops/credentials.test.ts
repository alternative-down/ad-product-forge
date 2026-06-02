/**
 * Tests for createCredentialsOps — Part of #5318.
 *
 * These tests cover the new real implementation in ops/credentials.ts.
 * The previous stub-based tests (delegating to ctx.parseCredentials etc.) are gone
 * because the new implementation has the logic inlined.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpsContext } from './context';

// Mock the dependencies of the new implementation
vi.mock('../../encryption/crypto', () => ({
  encryptSecret: vi.fn().mockReturnValue('encrypted'),
  decryptSecret: vi.fn().mockReturnValue(JSON.stringify({ status: 'active' })),
}));

vi.mock('../types', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    githubAppCredentialsSchema: {
      parse: vi.fn((x) => x),
    },
  };
});

vi.mock('../helpers', () => ({
  normalizeGitHubAppCredentials: vi.fn((x) => x),
}));

const sharedDb = { query: { agentProviders: { findFirst: vi.fn() } } };

const baseCtx = (): any => ({
  config: {
    db: sharedDb as unknown as OpsContext['config']['db'],
    httpServer: vi.fn() as unknown as OpsContext['config']['httpServer'],
    publicBaseUrl: 'https://forge.example.com',
    integrations: vi.fn() as unknown as OpsContext['config']['integrations'],
  },
  notifications: vi.fn() as unknown as OpsContext['notifications'],
  routeCleanups: new Map(),
  GITHUB_PROVIDER_TYPE: 'github-app',
  and: vi.fn().mockImplementation((a: unknown) => a) as unknown as OpsContext['and'],
  eq: vi.fn().mockImplementation((a: unknown, b: unknown) => ({
    type: 'eq',
    a,
    b,
  })) as unknown as OpsContext['eq'],
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
  createGitHubApp: vi.fn() as unknown as OpsContext['createGitHubApp'],
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
  opsRouting: {
    buildProvisioning: vi.fn(),
    registerAgentRoutes: vi.fn(),
    handleRegisterPage: vi.fn(),
    handleManifestCallback: vi.fn(),
    handleSetupCallback: vi.fn(),
    handleWebhook: vi.fn(),
  },
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
    sharedDb.query.agentProviders.findFirst.mockResolvedValueOnce({
      encryptedCredentials: 'encrypted-value',
    });
    const ops = createCredentialsOps(baseCtx());
    const result = await ops.getCredentials('agent-1');
    expect(result).toEqual({ status: 'active' });
  });

  it('getActiveCredentials throws when credentials not active', async () => {
    const { createCredentialsOps } = await import('./credentials.js');
    const { decryptSecret } = await import('../../encryption/crypto');
    (decryptSecret as any).mockReturnValueOnce(JSON.stringify({ status: 'pending' }));
    sharedDb.query.agentProviders.findFirst.mockResolvedValueOnce({
      encryptedCredentials: 'encrypted-pending',
    });
    const ops = createCredentialsOps(baseCtx());
    await expect(ops.getActiveCredentials('agent-2')).rejects.toThrow(
      'GitHub App not active for agent agent-2',
    );
  });

  it('getActiveCredentials returns active credentials', async () => {
    const { createCredentialsOps } = await import('./credentials.js');
    sharedDb.query.agentProviders.findFirst.mockResolvedValueOnce({
      encryptedCredentials: 'encrypted-active',
    });
    const ops = createCredentialsOps(baseCtx());
    const result = await ops.getActiveCredentials('agent-3');
    expect(result).toEqual({ status: 'active' });
  });

  it('parseCredentials returns parsed result on success', async () => {
    const { createCredentialsOps } = await import('./credentials.js');
    const ops = createCredentialsOps(baseCtx());
    const result = ops.parseCredentials('encrypted-value');
    expect(result).toEqual({ status: 'active' });
  });
});
