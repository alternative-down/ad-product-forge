import { describe, expect, it, vi } from 'vitest';
import type { OpsContext } from './context';
import type { GitHubAppCredentials } from '../types';

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
  DEFAULT_GITHUB_APP_MANIFEST_CONFIG: {
    name: 'TestApp',
    url: '',
    callbackUrls: [],
    redirectUrl: '',
    hookAttributes: {},
    callbackURL: '',
    permissions: {},
    events: [],
  },
  buildManifestEvents: () => ['issues', 'pull_request'],
  buildManifestPermissions: () => ({ contents: 'read' }),
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

const manifestConfig = {
  name: 'TestApp',
  url: '',
  callbackUrls: [],
  redirectUrl: '',
  hookAttributes: {},
  callbackURL: '',
  permissions: {},
  events: [],
};

describe('createRoutingOps', () => {
  it('buildProvisioning returns correct structure for active credentials with installUrl', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const routing = createRoutingOps(makeCtx());
    const result = routing.buildProvisioning('agent-123', {
      status: 'active',
      appSlug: 'my-app',
      manifestConfig: manifestConfig as any,
      encryptedCredentials: 'x',
    } as any);
    expect(result.agentId).toBe('agent-123');
    expect(result.status).toBe('active');
    expect(result.registrationUrl).toBe(
      'https://forge.example.com/webhook/github/agent-123/register',
    );
    expect(result.installUrl).toBe('https://github.com/apps/my-app/installations/new');
    expect((result.manifestConfig as any).name).toBe('TestApp');
  });

  it('buildProvisioning omits installUrl for pending credentials', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const routing = createRoutingOps(makeCtx());
    const result = routing.buildProvisioning('agent-456', {
      status: 'pending',
      manifestConfig: manifestConfig as any,
      encryptedCredentials: 'x',
    } as any);
    expect(result.status).toBe('pending');
    expect(result.installUrl).toBeUndefined();
    expect(result.registrationUrl).toContain('agent-456');
  });

  it('buildProvisioning includes installUrl for created status', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const routing = createRoutingOps(makeCtx());
    const result = routing.buildProvisioning('agent-789', {
      status: 'created',
      appSlug: 'new-app',
      manifestConfig: manifestConfig as any,
      encryptedCredentials: 'x',
    } as any);
    expect(result.status).toBe('created');
    expect(result.installUrl).toBe('https://github.com/apps/new-app/installations/new');
  });
});
describe('createRoutingOps — registerAgentRoutes', () => {
  it('registerAgentRoutes registers 4 routes and stores cleanups', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const httpMock = { registerRoute: vi.fn().mockReturnValue(vi.fn()) };
    const ctx = makeCtx();
    ctx.config.httpServer = httpMock as unknown as OpsContext['config']['httpServer'];
    const routeCleanups = new Map<string, Array<() => void>>();
    ctx.routeCleanups = routeCleanups;
    const routing = createRoutingOps(ctx);
    routing.registerAgentRoutes('agent-register');
    expect(httpMock.registerRoute).toHaveBeenCalledTimes(4);
    expect(routeCleanups.has('agent-register')).toBe(true);
    expect(routeCleanups.get('agent-register')!.length).toBe(4);
  });

  it('registerAgentRoutes uses correct paths', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const routeCalls: Array<{ method: string; path: string }> = [];
    const httpMock = {
      registerRoute: vi
        .fn()
        .mockImplementation(
          ({ method, path }: { method: string; path: string; handler: unknown }) => {
            routeCalls.push({ method, path });
            return vi.fn();
          },
        ),
    };
    const ctx = makeCtx();
    ctx.config.httpServer = httpMock as unknown as OpsContext['config']['httpServer'];
    const routing = createRoutingOps(ctx);
    routing.registerAgentRoutes('agent-x');
    expect(routeCalls.map((r) => `${r.method}:${r.path}`)).toEqual([
      'GET:/webhook/github/agent-x/register',
      'GET:/webhook/github/agent-x/callback',
      'GET:/webhook/github/agent-x/setup',
      'POST:/webhook/github/agent-x/event',
    ]);
  });
});

describe('createRoutingOps — handleRegisterPage', () => {
  it('returns 404 when no credentials found', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue(null);
    const routing = createRoutingOps(ctx);
    const result = await routing.handleRegisterPage('agent-no-creds');
    expect(result.status).toBe(404);
    expect(result.body).toContain('not provisioned');
  });

  it('returns 200 with status when credentials are not pending', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue({
      status: 'active',
      appSlug: 'active-app',
      manifestConfig: {
        name: 'App',
        url: '',
        callbackUrls: [],
        redirectUrl: '',
        hookAttributes: {},
        callbackURL: '',
      },
      encryptedCredentials: 'x',
    });
    ctx.buildManifestEvents = vi.fn().mockReturnValue(['issues']);
    ctx.buildManifestPermissions = vi.fn().mockReturnValue({ issues: 'write' });
    ctx.getGlobalConfig = vi
      .fn()
      .mockResolvedValue({ organization: 'my-org', appHomeUrl: 'https://app.example.com' });
    const routing = createRoutingOps(ctx);
    const result = await routing.handleRegisterPage('agent-active');
    expect(result.status).toBe(200);
    expect(result.body).toContain('active');
  });

  it('returns HTML form with manifest when credentials are pending', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue({
      status: 'pending',
      manifestConfig: {
        name: 'PendingApp',
        url: '',
        callbackUrls: [],
        redirectUrl: '',
        hookAttributes: {},
        callbackURL: '',
      },
      appName: 'PendingApp',
      state: 'abc123',
      createdAt: 1700000000000,
      encryptedCredentials: 'x',
    });
    ctx.buildManifestEvents = vi.fn().mockReturnValue(['issues']);
    ctx.buildManifestPermissions = vi.fn().mockReturnValue({ issues: 'write' });
    ctx.getGlobalConfig = vi
      .fn()
      .mockResolvedValue({ organization: 'my-org', appHomeUrl: 'https://app.example.com' });
    const routing = createRoutingOps(ctx);
    const result = await routing.handleRegisterPage('agent-pending');
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(result.body).toContain('form');
    expect(result.body).toContain('PendingApp');
  });
});

describe('createRoutingOps — handleSetupCallback', () => {
  it('returns 404 when credentials not in created status', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue(null);
    const routing = createRoutingOps(ctx);
    const result = await routing.handleSetupCallback('agent-1', '12345');
    expect(result.status).toBe(404);
    expect(result.body).toContain('not ready');
  });

  it('returns 400 when installation_id missing', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue({
      status: 'created',
      appId: 1,
      privateKey: 'key',
      webhookSecret: 'secret',
      appSlug: 'app',
      appName: 'App',
      manifestConfig: {
        name: 'App',
        url: '',
        callbackUrls: [],
        redirectUrl: '',
        hookAttributes: {},
        callbackURL: '',
      },
      createdAt: 1,
      encryptedCredentials: 'x',
    });
    const routing = createRoutingOps(ctx);
    const result = await routing.handleSetupCallback('agent-1', null);
    expect(result.status).toBe(400);
    expect(result.body).toContain('Missing installation_id');
  });

  it('returns 400 for non-numeric installation_id', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue({
      status: 'created',
      appId: 1,
      privateKey: 'key',
      webhookSecret: 'secret',
      appSlug: 'app',
      appName: 'App',
      manifestConfig: {
        name: 'App',
        url: '',
        callbackUrls: [],
        redirectUrl: '',
        hookAttributes: {},
        callbackURL: '',
      },
      createdAt: 1,
      encryptedCredentials: 'x',
    });
    const routing = createRoutingOps(ctx);
    const result = await routing.handleSetupCallback('agent-1', 'not-a-number');
    expect(result.status).toBe(400);
    expect(result.body).toContain('Invalid installation_id');
  });

  it('saves active credentials and creates notification on success', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const notifyMock = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue({
      status: 'created',
      appId: 999,
      privateKey: 'pk',
      webhookSecret: 'ws',
      appSlug: 'my-app',
      appName: 'My App',
      manifestConfig: {
        name: 'App',
        url: '',
        callbackUrls: [],
        redirectUrl: '',
        hookAttributes: {},
        callbackURL: '',
      },
      createdAt: 1,
      encryptedCredentials: 'x',
    });
    ctx.saveCredentials = saveMock;
    ctx.getGlobalConfig = vi
      .fn()
      .mockResolvedValue({ organization: 'my-org', appHomeUrl: 'https://app.example.com' });
    ctx.notifications = {
      createNotification: notifyMock,
    } as unknown as OpsContext['notifications'];
    ctx.createGitHubInstallWakeContent = vi.fn().mockReturnValue('wake-content');
    const routing = createRoutingOps(ctx);
    const result = await routing.handleSetupCallback('agent-1', '12345');
    expect(result.status).toBe(200);
    expect(saveMock).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({ status: 'active', installationId: 12345 }),
    );
    expect(notifyMock).toHaveBeenCalledWith({ agentId: 'agent-1', content: 'wake-content' });
  });
});

describe('createRoutingOps — handleWebhook', () => {
  it('returns 400 when x-github-event header missing', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getHeader = vi
      .fn()
      .mockImplementation((headers: Record<string, string>, key: string) => headers[key] ?? null);
    const routing = createRoutingOps(ctx);
    const result = await routing.handleWebhook('agent-1', {}, '{}');
    expect(result.status).toBe(400);
    expect(result.body).toContain('Missing webhook headers');
  });

  it('returns 400 when body is not valid JSON', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getHeader = vi
      .fn()
      .mockImplementation((headers: Record<string, string>, key: string) => headers[key] ?? null);
    ctx.isGitHubSelfEvent = vi.fn().mockReturnValue(false);
    const routing = createRoutingOps(ctx);
    const result = await routing.handleWebhook(
      'agent-1',
      { 'x-github-event': 'push', 'x-github-delivery': 'abc' },
      'not json',
    );
    expect(result.status).toBe(400);
    expect(result.body).toContain('Invalid JSON');
  });

  it('returns 200 for self events without creating notification', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getHeader = vi
      .fn()
      .mockImplementation((headers: Record<string, string>, key: string) => headers[key] ?? null);
    ctx.isGitHubSelfEvent = vi.fn().mockReturnValue(true);
    ctx.notifications = { createNotification: vi.fn() } as unknown as OpsContext['notifications'];
    const routing = createRoutingOps(ctx);
    const result = await routing.handleWebhook(
      'agent-1',
      { 'x-github-event': 'push', 'x-github-delivery': 'xyz' },
      '{"ref":"refs/heads/main"}',
    );
    expect(result.status).toBe(200);
    expect(result.body).toBe('ok');
  });

  it('creates notification and returns 202 for valid non-self webhook', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const notifyMock = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx();
    ctx.getHeader = vi
      .fn()
      .mockImplementation((headers: Record<string, string>, key: string) => headers[key] ?? null);
    ctx.isGitHubSelfEvent = vi.fn().mockReturnValue(false);
    ctx.notifications = {
      createNotification: notifyMock,
    } as unknown as OpsContext['notifications'];
    ctx.createGitHubWebhookWakeContent = vi.fn().mockReturnValue('webhook-wake');
    const routing = createRoutingOps(ctx);
    const result = await routing.handleWebhook(
      'agent-1',
      { 'x-github-event': 'issues', 'x-github-delivery': 'def456' },
      '{"action":"opened","issue":{"id":1}}',
    );
    expect(result.status).toBe(202);
    expect(result.body).toBe('Accepted');
    expect(notifyMock).toHaveBeenCalledWith({ agentId: 'agent-1', content: 'webhook-wake' });
  });
});
