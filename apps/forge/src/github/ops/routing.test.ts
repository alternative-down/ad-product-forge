import { describe, expect, it, vi } from 'vitest';
import { createHmac } from 'node:crypto';
import type { OpsContext } from './context';

// Test helper: sign a body with the GitHub webhook secret.
// Returns the value to use for the x-hub-signature-256 header.
const TEST_WEBHOOK_SECRET = 'test-webhook-secret-for-unit-tests-only';
function signWebhookBody(body: string, secret: string = TEST_WEBHOOK_SECRET): string {
  return 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
}

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
  githubEscapeHtml: (s: string) => s,
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
  it('returns 404 when no credentials exist', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue(null);
    const routing = createRoutingOps(ctx);
    const result = await routing.handleSetupCallback('agent-1', '12345');
    expect(result.status).toBe(404);
    expect(result.body).toContain('not ready');
  });

  it('returns 404 when credentials are in pending state (manifest callback not complete)', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue({
      status: 'pending',
      state: 'state-xyz',
      appName: 'pending-app',
      manifestConfig: {
        name: 'App',
        url: '',
        callbackUrls: [],
        redirectUrl: '',
        hookAttributes: {},
        callbackURL: '',
      },
      createdAt: 1,
    });
    const routing = createRoutingOps(ctx);
    const result = await routing.handleSetupCallback('agent-1', '12345');
    expect(result.status).toBe(404);
    expect(result.body).toContain('not complete');
  });

  it('accepts reinstall for active credentials with different installationId (cascade recovery)', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const notifyMock = vi.fn().mockResolvedValue(undefined);
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue({
      status: 'active',
      appId: 999,
      privateKey: 'pk',
      webhookSecret: 'ws',
      installationId: 11111, // OLD installation (dead)
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
    const result = await routing.handleSetupCallback('agent-1', '22222');
    expect(result.status).toBe(200);
    expect(saveMock).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({ status: 'active', installationId: 22222 }),
    );
    expect(notifyMock).toHaveBeenCalled();
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
    ctx.getCredentials = vi.fn().mockResolvedValue({ webhookSecret: TEST_WEBHOOK_SECRET });
    const routing = createRoutingOps(ctx);
    const body = '{}';
    const sig = signWebhookBody(body);
    const result = await routing.handleWebhook('agent-1', { 'x-hub-signature-256': sig }, body);
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
    ctx.getCredentials = vi.fn().mockResolvedValue({ webhookSecret: TEST_WEBHOOK_SECRET });
    const routing = createRoutingOps(ctx);
    const body = 'not json';
    const sig = signWebhookBody(body);
    const result = await routing.handleWebhook(
      'agent-1',
      { 'x-github-event': 'push', 'x-github-delivery': 'abc', 'x-hub-signature-256': sig },
      body,
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
    ctx.getCredentials = vi.fn().mockResolvedValue({ webhookSecret: TEST_WEBHOOK_SECRET });
    const routing = createRoutingOps(ctx);
    const body = '{"ref":"refs/heads/main"}';
    const sig = signWebhookBody(body);
    const result = await routing.handleWebhook(
      'agent-1',
      { 'x-github-event': 'push', 'x-github-delivery': 'xyz', 'x-hub-signature-256': sig },
      body,
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
    ctx.getCredentials = vi.fn().mockResolvedValue({ webhookSecret: TEST_WEBHOOK_SECRET });
    const routing = createRoutingOps(ctx);
    const body = '{"action":"opened","issue":{"id":1}}';
    const sig = signWebhookBody(body);
    const result = await routing.handleWebhook(
      'agent-1',
      { 'x-github-event': 'issues', 'x-github-delivery': 'def456', 'x-hub-signature-256': sig },
      body,
    );
    expect(result.status).toBe(202);
    expect(result.body).toBe('Accepted');
    expect(notifyMock).toHaveBeenCalledWith({ agentId: 'agent-1', content: 'webhook-wake' });
  });
});

// Hoisted mock for the octokit module. The Octokit class is used directly
// (new Octokit() for the unauthenticated manifest-conversion request) and
// the App class is used for the authenticated GET /app request after
// the conversion succeeds. Hoisting is required so vi.mock can reference
// these values at module-load time without temporal-dead-zone errors.
const {
  mockConversionRequest,
  mockAppRequest,
  MockOctokit,
  MockApp,
} = vi.hoisted(() => {
  const mockConversionRequest = vi.fn();
  const mockAppRequest = vi.fn();
  const MockOctokit = vi.fn().mockImplementation(function (this: unknown) {
    return { request: mockConversionRequest };
  });
  const MockApp = vi.fn().mockImplementation(function (this: unknown) {
    return { octokit: { request: mockAppRequest } };
  });
  return { mockConversionRequest, mockAppRequest, MockOctokit, MockApp };
});

vi.mock('octokit', () => ({
  App: MockApp,
  Octokit: MockOctokit,
}));

describe('createRoutingOps — handleManifestCallback', () => {
  beforeEach(() => {
    mockConversionRequest.mockReset();
    mockAppRequest.mockReset();
    MockOctokit.mockClear();
    MockApp.mockClear();
  });

  const pendingCredentials = {
    status: 'pending' as const,
    state: 'state-abc',
    appName: 'TestApp',
    manifestConfig: manifestConfig as any,
    createdAt: 1700000000000,
    encryptedCredentials: 'x',
  };

  function makeManifestCtx(overrides: Partial<ReturnType<typeof makeCtx>> = {}) {
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue(pendingCredentials);
    return { ...ctx, ...overrides };
  }

  it('returns 404 when no credentials exist for the agent', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue(null);
    const routing = createRoutingOps(ctx);
    const result = await routing.handleManifestCallback('agent-missing', 'code-1', 'state-abc');
    expect(result.status).toBe(404);
    expect(result.body).toContain('not pending');
    expect(mockConversionRequest).not.toHaveBeenCalled();
  });

  it('returns 404 when credentials are not in pending status', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeCtx();
    ctx.getCredentials = vi.fn().mockResolvedValue({
      status: 'created',
      appId: 1,
      privateKey: 'k',
      webhookSecret: 's',
      appSlug: 'app',
      appName: 'App',
      manifestConfig: manifestConfig as any,
      createdAt: 1,
      encryptedCredentials: 'x',
    });
    const routing = createRoutingOps(ctx);
    const result = await routing.handleManifestCallback('agent-active', 'code-1', 'state-abc');
    expect(result.status).toBe(404);
    expect(mockConversionRequest).not.toHaveBeenCalled();
  });

  it('returns 400 when code query parameter is missing', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeManifestCtx();
    const routing = createRoutingOps(ctx);
    const result = await routing.handleManifestCallback('agent-1', null, 'state-abc');
    expect(result.status).toBe(400);
    expect(result.body).toContain('Invalid manifest callback');
    expect(mockConversionRequest).not.toHaveBeenCalled();
  });

  it('returns 400 when state does not match the stored state', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const ctx = makeManifestCtx();
    const routing = createRoutingOps(ctx);
    const result = await routing.handleManifestCallback('agent-1', 'code-1', 'wrong-state');
    expect(result.status).toBe(400);
    expect(result.body).toContain('Invalid manifest callback');
    expect(mockConversionRequest).not.toHaveBeenCalled();
  });

  it('returns 200, persists created credentials, and links the install URL on success', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const ctx = makeManifestCtx({ saveCredentials: saveMock });
    mockConversionRequest.mockResolvedValue({
      data: {
        id: 4242,
        pem: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
        webhook_secret: 'whsec_x',
      },
    });
    mockAppRequest.mockResolvedValue({
      data: {
        id: 4242,
        name: 'My Test App',
        slug: 'my-test-app',
      },
    });
    const routing = createRoutingOps(ctx);
    const result = await routing.handleManifestCallback('agent-1', 'code-1', 'state-abc');
    expect(result.status).toBe(200);
    expect(result.body).toContain('GitHub App created');
    expect(result.body).toContain('my-test-app');
    // The conversion request should hit the unauthenticated Octokit, not App.
    expect(mockConversionRequest).toHaveBeenCalledWith(
      'POST /app-manifests/{code}/conversions',
      { code: 'code-1' },
    );
    // The authenticated GET /app call should go through app.octokit.request
    // (typed, no recast) on the App instance constructed with the converted
    // credentials.
    expect(mockAppRequest).toHaveBeenCalledWith('GET /app');
    expect(saveMock).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({
        status: 'created',
        appId: 4242,
        privateKey: '-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----',
        webhookSecret: 'whsec_x',
        appSlug: 'my-test-app',
        appName: 'My Test App',
        manifestConfig: pendingCredentials.manifestConfig,
        createdAt: pendingCredentials.createdAt,
      }),
    );
  });

  it('falls back to "unknown" appSlug and skips the slug in the install link when missing', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const ctx = makeManifestCtx({ saveCredentials: saveMock });
    mockConversionRequest.mockResolvedValue({
      data: { id: 1, pem: 'pem', webhook_secret: 'ws' },
    });
    mockAppRequest.mockResolvedValue({
      data: { id: 1, name: 'NoSlugApp' /* slug missing */ },
    });
    const routing = createRoutingOps(ctx);
    const result = await routing.handleManifestCallback('agent-1', 'code-1', 'state-abc');
    expect(result.status).toBe(200);
    expect(saveMock).toHaveBeenCalledWith(
      'agent-1',
      expect.objectContaining({ appSlug: 'unknown', appName: 'NoSlugApp' }),
    );
  });

  it('returns 500 when the manifest conversion request rejects', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const ctx = makeManifestCtx({ saveCredentials: saveMock });
    mockConversionRequest.mockRejectedValue(new Error('GitHub API down'));
    const routing = createRoutingOps(ctx);
    const result = await routing.handleManifestCallback('agent-1', 'code-1', 'state-abc');
    expect(result.status).toBe(500);
    expect(result.body).toContain('Failed');
    expect(result.body).toContain('GitHub API down');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the GET /app request rejects after a successful conversion', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const ctx = makeManifestCtx({ saveCredentials: saveMock });
    mockConversionRequest.mockResolvedValue({
      data: { id: 1, pem: 'pem', webhook_secret: 'ws' },
    });
    mockAppRequest.mockRejectedValue(new Error('app info failed'));
    const routing = createRoutingOps(ctx);
    const result = await routing.handleManifestCallback('agent-1', 'code-1', 'state-abc');
    expect(result.status).toBe(500);
    expect(result.body).toContain('Failed');
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('returns 500 when the conversion response is missing required fields (zod failure)', async () => {
    const { createRoutingOps } = await import('./routing.js');
    const saveMock = vi.fn().mockResolvedValue(undefined);
    const ctx = makeManifestCtx({ saveCredentials: saveMock });
    // Missing pem and webhook_secret — these would have been silently
    // accepted by the previous as-unknown-as cast cluster and produced
    // undefined values persisted to the credentials store.
    mockConversionRequest.mockResolvedValue({ data: { id: 1 } });
    const routing = createRoutingOps(ctx);
    const result = await routing.handleManifestCallback('agent-1', 'code-1', 'state-abc');
    expect(result.status).toBe(500);
    expect(saveMock).not.toHaveBeenCalled();
  });
});
