/**
 * Tests for createAppLifecycleOps — Part of #5318 (security-critical, P1 file 2 of 4 in #5789).
 *
 * Coverage scope (10 functions, 251 LoC):
 * - getGlobalConfig: read config or throw if missing
 * - isConfigured: boolean check
 * - getDefaultOwner: owner or fallback
 * - createAgentApp: provision new app, reject duplicates
 * - getAgentProvisioning: existing / null / create-new paths
 * - updateAgentManifestConfig: update or throw
 * - loadAllAgents: iterate providers, register routes
 * - unloadAgent: clear route cleanups
 * - deleteAgentApp: GitHub API call if active
 * - getGitCredentials: token, repositoryUrl, git user/email
 *
 * L#NN-13 13a: heavy mocking of ctx.config.db (no real DB), githubApp, credentials
 * per the OpsContext pattern established in credentials.test.ts (sibling file).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppLifecycleOps } from './app-lifecycle';
import type { OpsContext } from './context';
import type {
  GitHubAppCredentials,
  GitHubAppManifestConfig,
  GitHubAppProvisioning,
} from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockForgeDebug = vi.hoisted(() => vi.fn());
vi.mock('@forge-runtime/core', () => ({ forgeDebug: mockForgeDebug }));

vi.mock('../helpers', () => ({
  createAppName: vi.fn((name: string, id: string) => `${name}-${id}`),
}));

vi.mock('../types', async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    githubAppManifestConfigSchema: {
      parse: vi.fn((x) => x),
    },
  };
});

// ─── Test fixtures (declared early to avoid TDZ in makeCtx) ──────────────────

const manifestConfigShape: GitHubAppManifestConfig = {
  permissions: {
    administration: false,
    contents: true,
    issues: true,
    metadata: true,
    organization_projects: false,
    pull_requests: true,
    repository_projects: false,
    workflows: false,
  },
  events: {
    push: false,
    pull_request: true,
    pull_request_review: false,
    issues: true,
    issue_comment: false,
    repository: false,
    workflow_run: false,
  },
};

const provisioningShape: GitHubAppProvisioning = {
  agentId: 'a-1',
  status: 'active',
  registrationUrl: '/r/test',
  manifestConfig: manifestConfigShape,
};

const activeCredentials: Extract<GitHubAppCredentials, { status: 'active' }> = {
  status: 'active',
  appId: 12345,
  appSlug: 'test-app',
  appName: 'Test App',
  installationId: 67890,
  privateKey: 'private-key-content',
  webhookSecret: 'webhook-secret',
  manifestConfig: manifestConfigShape,
  createdAt: 1000,
};

const pendingCredentials: Extract<GitHubAppCredentials, { status: 'pending' }> = {
  status: 'pending',
  state: 'state-123',
  appName: 'pending-app',
  manifestConfig: manifestConfigShape,
  createdAt: 1000,
};

const githubConfig = { organization: 'acme', appHomeUrl: 'https://acme.com/apps' };

const mockOctokit = {
  request: vi.fn().mockResolvedValue({ data: {} }),
};

const mockGithubApp = {
  createGitHubApp: vi.fn().mockReturnValue({ octokit: mockOctokit }),
  createInstallationOctokit: vi.fn().mockReturnValue(mockOctokit),
  getInstallationToken: vi.fn().mockResolvedValue({
    token: 'ghs_testtoken123',
    expiresAt: '2026-12-31T00:00:00Z',
  }),
};

const mockCredentials = {
  getCredentials: vi.fn(),
  getActiveCredentials: vi.fn(),
};

const mockDb = {
  query: {
    agentProviders: {
      findMany: vi.fn().mockResolvedValue([]),
    },
    agents: {
      findFirst: vi.fn(),
    },
  },
};

const mockOpsRouting = {
  buildProvisioning: vi.fn().mockReturnValue(provisioningShape),
  registerAgentRoutes: vi.fn(),
  handleRegisterPage: vi.fn(),
  handleManifestCallback: vi.fn(),
  handleSetupCallback: vi.fn(),
  handleWebhook: vi.fn(),
};

function makeCtx(overrides: Partial<OpsContext> = {}): OpsContext {
  return {
    config: {
      db: mockDb as unknown as OpsContext['config']['db'],
      httpServer: vi.fn() as unknown as OpsContext['config']['httpServer'],
      publicBaseUrl: 'https://forge.example.com',
      integrations: {
        getGitHubConfig: vi.fn().mockResolvedValue(githubConfig),
      } as unknown as OpsContext['config']['integrations'],
    },
    notifications: vi.fn() as unknown as OpsContext['notifications'],
    routeCleanups: new Map(),
    GITHUB_PROVIDER_TYPE: 'github-app',
    and: vi.fn().mockImplementation((a: unknown) => a) as unknown as OpsContext['and'],
    eq: vi.fn().mockImplementation((a: unknown, b: unknown) => ({ type: 'eq', a, b })) as unknown as OpsContext['eq'],
    agentProviders: vi.fn() as unknown as OpsContext['agentProviders'],
    agents: vi.fn() as unknown as OpsContext['agents'],
    createId: () => 'test-id',
    nanoid: () => 'nano-id',
    forgeDebug: mockForgeDebug,
    getGlobalConfig: vi.fn() as unknown as OpsContext['getGlobalConfig'],
    getDefaultOwner: vi.fn().mockResolvedValue('acme') as unknown as OpsContext['getDefaultOwner'],
    getInstallationOctokit: vi.fn() as unknown as OpsContext['getInstallationOctokit'],
    getInstallationToken: vi.fn() as unknown as OpsContext['getInstallationToken'],
    getCredentials: mockCredentials.getCredentials as unknown as OpsContext['getCredentials'],
    getActiveCredentials: mockCredentials.getActiveCredentials as unknown as OpsContext['getActiveCredentials'],
    saveCredentials: vi.fn().mockResolvedValue(undefined),
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
    DEFAULT_GITHUB_APP_MANIFEST_CONFIG: manifestConfigShape as OpsContext['DEFAULT_GITHUB_APP_MANIFEST_CONFIG'],
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
    opsRouting: mockOpsRouting as unknown as OpsContext['opsRouting'],
    ...overrides,
  } as unknown as OpsContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockOctokit.request.mockResolvedValue({ data: {} });
  mockGithubApp.getInstallationToken.mockResolvedValue({
    token: 'ghs_testtoken123',
    expiresAt: '2026-12-31T00:00:00Z',
  });
  mockDb.query.agentProviders.findMany.mockResolvedValue([]);
});

// ─── getGlobalConfig ─────────────────────────────────────────────────────────

describe('getGlobalConfig', () => {
  it('returns the GitHub config from integrations', async () => {
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    const result = await ops.getGlobalConfig();
    expect(result).toEqual(githubConfig);
  });

  it('throws "not configured" when getGitHubConfig returns null', async () => {
    const ctx = makeCtx();
    (ctx.config.integrations.getGitHubConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    await expect(ops.getGlobalConfig()).rejects.toThrow(/not configured/);
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn' }),
    );
  });
});

// ─── isConfigured ────────────────────────────────────────────────────────────

describe('isConfigured', () => {
  it('returns true when GitHub config is present', async () => {
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    expect(await ops.isConfigured()).toBe(true);
  });

  it('returns false when GitHub config is null', async () => {
    const ctx = makeCtx();
    (ctx.config.integrations.getGitHubConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    expect(await ops.isConfigured()).toBe(false);
  });
});

// ─── getDefaultOwner ─────────────────────────────────────────────────────────

describe('getDefaultOwner', () => {
  it('returns explicit owner when provided', async () => {
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    expect(await ops.getDefaultOwner('custom-owner')).toBe('custom-owner');
  });

  it('falls back to GitHub config organization when owner not provided', async () => {
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    expect(await ops.getDefaultOwner()).toBe(githubConfig.organization);
  });

  it('throws when fallback is needed but GitHub is not configured', async () => {
    const ctx = makeCtx();
    (ctx.config.integrations.getGitHubConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    await expect(ops.getDefaultOwner()).rejects.toThrow(/not configured/);
  });
});

// ─── createAgentApp ──────────────────────────────────────────────────────────

describe('createAgentApp', () => {
  it('creates pending credentials and returns provisioning when none exist', async () => {
    mockCredentials.getCredentials.mockResolvedValue(null);
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    const result = await ops.createAgentApp({ agentId: 'a-1', agentName: 'Agent One' });
    expect(result).toBe(provisioningShape);
    expect(ctx.saveCredentials).toHaveBeenCalledWith(
      'a-1',
      expect.objectContaining({ status: 'pending', state: 'test-id' }),
    );
    expect(mockOpsRouting.registerAgentRoutes).toHaveBeenCalledWith('a-1');
  });

  it('throws "already exists" when credentials exist for agent', async () => {
    mockCredentials.getCredentials.mockResolvedValue(activeCredentials);
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    await expect(ops.createAgentApp({ agentId: 'a-1', agentName: 'Agent One' })).rejects.toThrow(
      /already exists/,
    );
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn' }),
    );
  });

  it('throws when GitHub is not configured', async () => {
    const ctx = makeCtx();
    (ctx.config.integrations.getGitHubConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    await expect(ops.createAgentApp({ agentId: 'a-1', agentName: 'Agent One' })).rejects.toThrow(
      /not configured/,
    );
  });
});

// ─── getAgentProvisioning ────────────────────────────────────────────────────

describe('getAgentProvisioning', () => {
  it('returns existing provisioning when credentials exist', async () => {
    mockCredentials.getCredentials.mockResolvedValue(activeCredentials);
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    const result = await ops.getAgentProvisioning('a-1');
    expect(result).toBe(provisioningShape);
    expect(mockOpsRouting.buildProvisioning).toHaveBeenCalledWith('a-1', activeCredentials);
  });

  it('returns null when not configured and no credentials', async () => {
    mockCredentials.getCredentials.mockResolvedValue(null);
    const ctx = makeCtx();
    (ctx.config.integrations.getGitHubConfig as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    expect(await ops.getAgentProvisioning('a-1')).toBeNull();
  });

  it('returns null when agent does not exist in DB', async () => {
    mockCredentials.getCredentials.mockResolvedValue(null);
    mockDb.query.agents.findFirst.mockResolvedValue(null);
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    expect(await ops.getAgentProvisioning('a-1')).toBeNull();
  });

  it('creates new provisioning when agent exists but has no credentials', async () => {
    mockCredentials.getCredentials.mockResolvedValue(null);
    mockDb.query.agents.findFirst.mockResolvedValue({ id: 'a-1', name: 'Agent One' });
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    const result = await ops.getAgentProvisioning('a-1');
    expect(result).toBe(provisioningShape);
    expect(ctx.saveCredentials).toHaveBeenCalled();
  });
});

// ─── updateAgentManifestConfig ───────────────────────────────────────────────

describe('updateAgentManifestConfig', () => {
  it('updates credentials with parsed manifest config when existing', async () => {
    mockCredentials.getCredentials.mockResolvedValue(activeCredentials);
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    const result = await ops.updateAgentManifestConfig({
      agentId: 'a-1',
      manifestConfig: manifestConfigShape,
    });
    expect(result).toBe(provisioningShape);
    expect(ctx.saveCredentials).toHaveBeenCalledWith(
      'a-1',
      expect.objectContaining({ manifestConfig: manifestConfigShape }),
    );
  });

  it('throws "does not exist" when no credentials', async () => {
    mockCredentials.getCredentials.mockResolvedValue(null);
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    await expect(
      ops.updateAgentManifestConfig({
        agentId: 'a-1',
        manifestConfig: manifestConfigShape,
      }),
    ).rejects.toThrow(/does not exist/);
  });
});

// ─── loadAllAgents ───────────────────────────────────────────────────────────

describe('loadAllAgents', () => {
  it('registers routes for each agent provider with parseable credentials', async () => {
    mockDb.query.agentProviders.findMany.mockResolvedValue([
      { agentId: 'a-1', encryptedCredentials: 'enc-1' },
      { agentId: 'a-2', encryptedCredentials: 'enc-2' },
    ]);
    const ctx = makeCtx();
    (ctx.parseCredentials as ReturnType<typeof vi.fn>).mockReturnValue(activeCredentials);
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    await ops.loadAllAgents();
    expect(mockOpsRouting.registerAgentRoutes).toHaveBeenCalledWith('a-1');
    expect(mockOpsRouting.registerAgentRoutes).toHaveBeenCalledWith('a-2');
  });

  it('skips agents with unparseable credentials and logs warn', async () => {
    mockDb.query.agentProviders.findMany.mockResolvedValue([
      { agentId: 'a-1', encryptedCredentials: 'enc-1' },
      { agentId: 'a-2', encryptedCredentials: 'bad' },
    ]);
    const ctx = makeCtx();
    (ctx.parseCredentials as ReturnType<typeof vi.fn>).mockImplementation((enc: string) =>
      enc === 'enc-1' ? activeCredentials : null,
    );
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    await ops.loadAllAgents();
    expect(mockOpsRouting.registerAgentRoutes).toHaveBeenCalledWith('a-1');
    expect(mockOpsRouting.registerAgentRoutes).not.toHaveBeenCalledWith('a-2');
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({ level: 'warn', message: expect.stringMatching(/unparseable/) }),
    );
  });
});

// ─── unloadAgent ─────────────────────────────────────────────────────────────

describe('unloadAgent', () => {
  it('runs all route cleanups and removes the entry', () => {
    const cleanup1 = vi.fn();
    const cleanup2 = vi.fn();
    const ctx = makeCtx();
    ctx.routeCleanups.set('a-1', [cleanup1, cleanup2]);
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    ops.unloadAgent('a-1');
    expect(cleanup1).toHaveBeenCalledTimes(1);
    expect(cleanup2).toHaveBeenCalledTimes(1);
    expect(ctx.routeCleanups.has('a-1')).toBe(false);
  });

  it('is a no-op when no cleanups registered for agent', () => {
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    expect(() => ops.unloadAgent('a-1')).not.toThrow();
  });
});

// ─── deleteAgentApp ──────────────────────────────────────────────────────────

describe('deleteAgentApp', () => {
  it('calls GitHub DELETE for active credentials', async () => {
    mockCredentials.getCredentials.mockResolvedValue(activeCredentials);
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    await ops.deleteAgentApp('a-1');
    expect(mockGithubApp.createGitHubApp).toHaveBeenCalledWith(activeCredentials);
    expect(mockOctokit.request).toHaveBeenCalledWith(
      'DELETE /app/installations/{installation_id}',
      { installation_id: 67890 },
    );
  });

  it('is a no-op when no credentials exist (unloads routes only)', async () => {
    mockCredentials.getCredentials.mockResolvedValue(null);
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    await ops.deleteAgentApp('a-1');
    expect(mockOctokit.request).not.toHaveBeenCalled();
  });

  it('is a no-op for pending credentials (no GitHub API call)', async () => {
    mockCredentials.getCredentials.mockResolvedValue(pendingCredentials);
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    await ops.deleteAgentApp('a-1');
    expect(mockOctokit.request).not.toHaveBeenCalled();
  });
});

// ─── getGitCredentials ───────────────────────────────────────────────────────

describe('getGitCredentials', () => {
  it('returns token, expiresAt, gitUserName, gitUserEmail from active credentials', async () => {
    mockCredentials.getActiveCredentials.mockResolvedValue(activeCredentials);
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    const result = await ops.getGitCredentials({ agentId: 'a-1' });
    expect(result.username).toBe('x-access-token');
    expect(result.token).toBe('ghs_testtoken123');
    expect(result.expiresAt).toBe('2026-12-31T00:00:00Z');
    expect(result.gitUserName).toBe(activeCredentials.appName);
    expect(result.gitUserEmail).toBe(`${activeCredentials.appSlug}@forge.github-app.local`);
    expect(result.repositoryUrl).toBeUndefined();
  });

  it('includes repositoryUrl when repositoryName is provided', async () => {
    mockCredentials.getActiveCredentials.mockResolvedValue(activeCredentials);
    const ctx = makeCtx();
    const ops = createAppLifecycleOps(ctx, { githubApp: mockGithubApp, credentials: mockCredentials });
    const result = await ops.getGitCredentials({ agentId: 'a-1', repositoryName: 'my-repo' });
    expect(result.repositoryUrl).toBe('https://github.com/acme/my-repo.git');
  });
});
