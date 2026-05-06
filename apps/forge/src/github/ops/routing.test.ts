import { describe, expect, it, vi } from 'vitest';
import type { OpsContext } from './context';
import type { GitHubAppCredentials } from '../types';

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
  getInstallationOctokit: vi.fn() as unknown as OpsContext['getInstallationOctokit'],
  getInstallationToken: vi.fn() as unknown as OpsContext['getInstallationToken'],
  getCredentials: vi.fn() as unknown as OpsContext['getCredentials'],
  getActiveCredentials: vi.fn() as unknown as OpsContext['getActiveCredentials'],
  saveCredentials: vi.fn() as unknown as OpsContext['saveCredentials'],
  parseCredentials: vi.fn() as unknown as OpsContext['parseCredentials'],
  createInstallationOctokit: vi.fn() as unknown as OpsContext['createInstallationOctokit'],
  getHeader: vi.fn(),
  getRegisterPath: (id: string) => `/webhook/github/${id}/register`,
  getManifestCallbackPath: (id: string) => `/webhook/github/${id}/callback`,
  getSetupPath: (id: string) => `/webhook/github/${id}/setup`,
  getWebhookPath: (id: string) => `/webhook/github/${id}/event`,
  escapeHtml: (s: string) => s,
  normalizeAssignees: (a: string[]) => a,
  toIssueSummary: vi.fn() as unknown as OpsContext['toIssueSummary'],
  toIssueDetails: vi.fn() as unknown as OpsContext['toIssueDetails'],
  DEFAULT_GITHUB_APP_MANIFEST_CONFIG: { name: 'TestApp', url: '', callbackUrls: [], redirectUrl: '', hookAttributes: {}, callbackURL: '' },
  buildManifestEvents: () => ['issues', 'pull_request'],
  buildManifestPermissions: () => ({ contents: 'read' }),
  createAppName: (n: string, id: string) => `${n}-${id}`,
  createGitHubInstallWakeContent: vi.fn() as unknown as OpsContext['createGitHubInstallWakeContent'],
  createGitHubWebhookWakeContent: vi.fn() as unknown as OpsContext['createGitHubWebhookWakeContent'],
  isGitHubSelfEvent: vi.fn() as unknown as OpsContext['isGitHubSelfEvent'],
  isRecord: vi.fn() as unknown as OpsContext['isRecord'],
  summarizeGitHubEvent: vi.fn() as unknown as OpsContext['summarizeGitHubEvent'],
  normalizeGitHubAppCredentials: vi.fn() as unknown as OpsContext['normalizeGitHubAppCredentials'],
  normalizeManifestConfig: vi.fn() as unknown as OpsContext['normalizeManifestConfig'],
});

const manifestConfig = { name: 'TestApp', url: '', callbackUrls: [], redirectUrl: '', hookAttributes: {}, callbackURL: '' };

describe('createRoutingOps', () => {
  it('buildProvisioning returns correct structure for active credentials with installUrl', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const routing = createRoutingOps(makeCtx());
    const result = routing.buildProvisioning('agent-123', { status: 'active', appSlug: 'my-app', manifestConfig, encryptedCredentials: 'x' });
    expect(result.agentId).toBe('agent-123');
    expect(result.status).toBe('active');
    expect(result.registrationUrl).toBe('https://forge.example.com/webhook/github/agent-123/register');
    expect(result.installUrl).toBe('https://github.com/apps/my-app/installations/new');
    expect(result.manifestConfig.name).toBe('TestApp');
  });

  it('buildProvisioning omits installUrl for pending credentials', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const routing = createRoutingOps(makeCtx());
    const result = routing.buildProvisioning('agent-456', { status: 'pending', manifestConfig, encryptedCredentials: 'x' });
    expect(result.status).toBe('pending');
    expect(result.installUrl).toBeUndefined();
    expect(result.registrationUrl).toContain('agent-456');
  });

  it('buildProvisioning includes installUrl for created status', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const routing = createRoutingOps(makeCtx());
    const result = routing.buildProvisioning('agent-789', { status: 'created', appSlug: 'new-app', manifestConfig, encryptedCredentials: 'x' });
    expect(result.status).toBe('created');
    expect(result.installUrl).toBe('https://github.com/apps/new-app/installations/new');
  });
});
