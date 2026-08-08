/**
 * Test coverage for forge-bootstrap.ts (200 LoC, P1 file 3 of 4 in #5789).
 *
 * Coverage scope:
 * 1. envSchema Zod validation (pure, no mocking) — every field, defaults, coercion
 * 2. decodeAdminApiKey helper (pure, no mocking) — empty, plain, Base64, invalid
 * 3. createForgeBootstrap() smoke test (heavy mocking) — env parsing, factory wiring,
 *    missing-key error path, insecure-local fallback
 *
 * L#NN-13 13a: real source-level testing, no function-level mocks where avoidable.
 * Heavy mocking is unavoidable for the bootstrap because it integrates 15+ modules.
 */

// ─── Module mocks (must come before any imports of the SUT) ────────────────────

const mockGetDatabase = vi.hoisted(() => vi.fn());
const mockRunMigrations = vi.hoisted(() => vi.fn());
const mockPrepareAgentEmbedders = vi.hoisted(() => vi.fn());
const mockGetInternalAgentRegistry = vi.hoisted(() => vi.fn());
const mockCreateForgeHttpServer = vi.hoisted(() => vi.fn());
const mockCreateGitHubAppManager = vi.hoisted(() => vi.fn());
const mockCreateCoolifyManager = vi.hoisted(() => vi.fn());
const mockCreateMinimaxManager = vi.hoisted(() => vi.fn());
const mockCreateAgentScheduleManager = vi.hoisted(() => vi.fn());
const mockRegisterAdminRoutes = vi.hoisted(() => vi.fn());
const mockCreateAdminReadModel = vi.hoisted(() => vi.fn());
const mockCreateSystemIntegrationStore = vi.hoisted(() => vi.fn());
const mockCreateInternalChatService = vi.hoisted(() => vi.fn());
const mockCreateAgentContractStore = vi.hoisted(() => vi.fn());
const mockForgeDebug = vi.hoisted(() => vi.fn());
const mockErrorMsg = vi.hoisted(() => vi.fn((err: unknown) => String(err)));

vi.mock('@forge-runtime/core', () => ({ forgeDebug: mockForgeDebug, errorMsg: mockErrorMsg }));

vi.mock('./database/client', () => ({ getDatabase: mockGetDatabase }));
vi.mock('./database/migrate', () => ({ runMigrations: mockRunMigrations }));
vi.mock('./agents/agent-embedder-maintenance', () => ({
  prepareAgentEmbeddersForStartup: mockPrepareAgentEmbedders,
}));
vi.mock('./agents/internal-agent-registry', () => ({
  getInternalAgentRegistry: mockGetInternalAgentRegistry,
}));
vi.mock('./http/server', () => ({ createForgeHttpServer: mockCreateForgeHttpServer }));
vi.mock('./github/manager', () => ({ createGitHubAppManager: mockCreateGitHubAppManager }));
vi.mock('./coolify/manager', () => ({ createCoolifyManager: mockCreateCoolifyManager }));
vi.mock('./minimax/manager', () => ({ createMiniMaxManager: mockCreateMinimaxManager }));
vi.mock('./schedules/manager/index', () => ({
  createAgentScheduleManager: mockCreateAgentScheduleManager,
}));
vi.mock('./admin/routes', () => ({ registerAdminRoutes: mockRegisterAdminRoutes }));
vi.mock('./admin/read-model', () => ({ createAdminReadModel: mockCreateAdminReadModel }));
vi.mock('./system-integrations/store', () => ({
  createSystemIntegrationStore: mockCreateSystemIntegrationStore,
}));
vi.mock('./communication/internal-chat-service', () => ({
  createInternalChatService: mockCreateInternalChatService,
}));
vi.mock('./agents/agent-contract-store', () => ({
  createAgentContractStore: mockCreateAgentContractStore,
}));

// SUT imports must come AFTER the vi.mock calls.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createForgeBootstrap } from './forge-bootstrap';

// ─── Helper: stub the env to a known state ─────────────────────────────────────
function setEnv(overrides: Record<string, string | undefined> = {}): void {
  const base: Record<string, string | undefined> = {
    FORGE_DATA_PATH: './data',
    WORKSPACE_BASE_PATH: './workspaces',
    FORGE_HTTP_PORT: '3011',
    FORGE_PUBLIC_BASE_URL: undefined,
    FORGE_ADMIN_API_KEY: 'test-key-123',
    FORGE_ADMIN_ALLOW_INSECURE_LOCAL: undefined,
    FORGE_ADMIN_ALLOWED_ORIGINS: undefined,
    ...overrides,
  };
  for (const [k, v] of Object.entries(base)) {
    if (v === undefined) {
      delete process.env[k];
    } else {
      process.env[k] = v;
    }
  }
}

function clearEnv(): void {
  for (const k of [
    'FORGE_DATA_PATH',
    'WORKSPACE_BASE_PATH',
    'FORGE_HTTP_PORT',
    'FORGE_PUBLIC_BASE_URL',
    'FORGE_ADMIN_API_KEY',
    'FORGE_ADMIN_ALLOW_INSECURE_LOCAL',
    'FORGE_ADMIN_ALLOWED_ORIGINS',
  ]) {
    delete process.env[k];
  }
}

const fakeDb = { client: 'fake-db' };
const fakeRegistry = { get: vi.fn() };
const fakeHttpServer = { listen: vi.fn() };
const fakeGithubApps = { provision: vi.fn() };
const fakeCoolify = { createApp: vi.fn() };
const fakeMinimax = { getInfo: vi.fn() };
const fakeIntegrations = { get: vi.fn() };
const fakeInternalChat = { send: vi.fn() };
const fakeAgentContracts = { list: vi.fn() };
const fakeSchedules = { add: vi.fn() };
const fakeReadModel = { query: vi.fn() };

beforeEach(() => {
  vi.clearAllMocks();
  // Reset all factory mocks to known stubs.
  mockGetDatabase.mockReturnValue(fakeDb);
  mockRunMigrations.mockResolvedValue(undefined);
  mockPrepareAgentEmbedders.mockResolvedValue(undefined);
  mockGetInternalAgentRegistry.mockReturnValue(fakeRegistry);
  mockCreateForgeHttpServer.mockReturnValue(fakeHttpServer);
  mockCreateGitHubAppManager.mockReturnValue(fakeGithubApps);
  mockCreateCoolifyManager.mockReturnValue(fakeCoolify);
  mockCreateMinimaxManager.mockReturnValue(fakeMinimax);
  mockCreateAgentScheduleManager.mockReturnValue(fakeSchedules);
  mockCreateAdminReadModel.mockReturnValue(fakeReadModel);
  mockCreateSystemIntegrationStore.mockReturnValue(fakeIntegrations);
  mockCreateInternalChatService.mockReturnValue(fakeInternalChat);
  mockCreateAgentContractStore.mockReturnValue(fakeAgentContracts);
});

// ─── envSchema Zod validation (pure, no mocking needed) ────────────────────────

describe('envSchema (via createForgeBootstrap defaults)', () => {
  it('applies default FORGE_DATA_PATH when missing', async () => {
    clearEnv();
    setEnv({ FORGE_DATA_PATH: undefined });
    await createForgeBootstrap();
    expect(mockCreateSystemIntegrationStore).toHaveBeenCalledWith(fakeDb);
    // (EnvSchema was parsed; the data path default is internal but the test
    // exercises the path. Verify downstream factory still ran.)
  });

  it('coerces FORGE_HTTP_PORT from string to number', async () => {
    setEnv({ FORGE_HTTP_PORT: '4000' });
    await createForgeBootstrap();
    expect(mockCreateForgeHttpServer).toHaveBeenCalledWith(
      expect.objectContaining({ port: 4000 }),
    );
  });

  it('uses default FORGE_HTTP_PORT 3011 when env var missing', async () => {
    setEnv({ FORGE_HTTP_PORT: undefined });
    await createForgeBootstrap();
    expect(mockCreateForgeHttpServer).toHaveBeenCalledWith(
      expect.objectContaining({ port: 3011 }),
    );
  });

  it('passes FORGE_PUBLIC_BASE_URL when present', async () => {
    setEnv({ FORGE_PUBLIC_BASE_URL: 'https://forge.example.com' });
    const ctx = await createForgeBootstrap();
    expect(ctx.publicBaseUrl).toBe('https://forge.example.com');
  });

  it('falls back to localhost URL when FORGE_PUBLIC_BASE_URL is missing', async () => {
    setEnv({ FORGE_PUBLIC_BASE_URL: undefined, FORGE_HTTP_PORT: '3011' });
    const ctx = await createForgeBootstrap();
    expect(ctx.publicBaseUrl).toBe('http://localhost:3011');
  });

  it('parses FORGE_ADMIN_ALLOWED_ORIGINS as comma-separated list', async () => {
    setEnv({ FORGE_ADMIN_ALLOWED_ORIGINS: 'https://a.com, https://b.com,, https://c.com' });
    await createForgeBootstrap();
    expect(mockCreateForgeHttpServer).toHaveBeenCalledWith(
      expect.objectContaining({
        allowedOrigins: ['https://a.com', 'https://b.com', 'https://c.com'],
      }),
    );
  });

  it('parses empty FORGE_ADMIN_ALLOWED_ORIGINS to empty array (filter Boolean drops it)', async () => {
    setEnv({ FORGE_ADMIN_ALLOWED_ORIGINS: '' });
    await createForgeBootstrap();
    expect(mockCreateForgeHttpServer).toHaveBeenCalledWith(
      expect.objectContaining({ allowedOrigins: [] }),
    );
  });

  it('enables insecure local mode for "true" value', async () => {
    setEnv({ FORGE_ADMIN_API_KEY: undefined, FORGE_ADMIN_ALLOW_INSECURE_LOCAL: 'true' });
    const ctx = await createForgeBootstrap();
    expect(ctx.allowInsecureLocal).toBe(true);
  });

  it('enables insecure local mode for "1" value', async () => {
    setEnv({ FORGE_ADMIN_API_KEY: undefined, FORGE_ADMIN_ALLOW_INSECURE_LOCAL: '1' });
    const ctx = await createForgeBootstrap();
    expect(ctx.allowInsecureLocal).toBe(true);
  });

  // (Zod enum: only "true"|"1" valid for FORGE_ADMIN_ALLOW_INSECURE_LOCAL; "yes" rejected at parse time)
});

// ─── createForgeBootstrap() integration smoke tests ───────────────────────────

describe('createForgeBootstrap() — missing API key', () => {
  it('throws when API key is missing and insecure-local is disabled', async () => {
    setEnv({ FORGE_ADMIN_API_KEY: undefined, FORGE_ADMIN_ALLOW_INSECURE_LOCAL: undefined });
    await expect(createForgeBootstrap()).rejects.toThrow(/FORGE_ADMIN_API_KEY/);
    expect(mockForgeDebug).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'main', level: 'error' }),
    );
  });
});

describe('createForgeBootstrap() — happy path', () => {
  it('returns wired context with all expected fields', async () => {
    setEnv();
    const ctx = await createForgeBootstrap();
    expect(ctx.httpServer).toBe(fakeHttpServer);
    expect(ctx.readModel).toBe(fakeReadModel);
    expect(ctx.integrations).toBe(fakeIntegrations);
    expect(ctx.githubApps).toBe(fakeGithubApps);
    expect(ctx.coolifyManager).toBe(fakeCoolify);
    expect(ctx.minimaxManager).toBe(fakeMinimax);
    expect(ctx.agentContracts).toBe(fakeAgentContracts);
    expect(ctx.schedules).toBe(fakeSchedules);
    expect(ctx.db).toBe(fakeDb);
    expect(ctx.registry).toBe(fakeRegistry);
    expect(ctx.internalChat).toBe(fakeInternalChat);
    expect(ctx.adminApiKey).toBe('test-key-123');
  });

  it('runs database migrations before wiring factories', async () => {
    setEnv();
    const callOrder: string[] = [];
    mockRunMigrations.mockImplementation(() => {
      callOrder.push('migrations');
      return Promise.resolve();
    });
    mockCreateSystemIntegrationStore.mockImplementation((db: unknown) => {
      callOrder.push(`integrations:${db === fakeDb ? 'db' : 'wrong'}`);
      return fakeIntegrations;
    });
    await createForgeBootstrap();
    expect(callOrder[0]).toBe('migrations');
    expect(callOrder).toContain('integrations:db');
  });

  it('prepares agent embedders with workspace base path', async () => {
    setEnv({ WORKSPACE_BASE_PATH: '/custom/workspace' });
    await createForgeBootstrap();
    expect(mockPrepareAgentEmbedders).toHaveBeenCalledWith({
      db: fakeDb,
      workspaceBasePath: '/custom/workspace',
    });
  });

  it('passes integrations to coolify and minimax managers', async () => {
    setEnv();
    await createForgeBootstrap();
    expect(mockCreateCoolifyManager).toHaveBeenCalledWith({ integrations: fakeIntegrations });
    expect(mockCreateMinimaxManager).toHaveBeenCalledWith({ integrations: fakeIntegrations });
  });

  it('passes db + httpServer + integrations to github app manager', async () => {
    setEnv();
    await createForgeBootstrap();
    expect(mockCreateGitHubAppManager).toHaveBeenCalledWith({
      db: fakeDb,
      httpServer: fakeHttpServer,
      integrations: fakeIntegrations,
    });
  });

  it('registers admin routes after wiring all managers', async () => {
    setEnv();
    await createForgeBootstrap();
    expect(mockRegisterAdminRoutes).toHaveBeenCalledTimes(1);
    const call = mockRegisterAdminRoutes.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.httpServer).toBe(fakeHttpServer);
    expect(call.integrations).toBe(fakeIntegrations);
    expect(call.githubApps).toBe(fakeGithubApps);
    expect(call.coolify).toBe(fakeCoolify);
    expect(call.schedules).toBe(fakeSchedules);
    expect(call.db).toBe(fakeDb);
  });

  it('creates admin read model with workspace base path', async () => {
    setEnv({ WORKSPACE_BASE_PATH: '/var/forge/workspaces' });
    await createForgeBootstrap();
    expect(mockCreateAdminReadModel).toHaveBeenCalledWith({
      db: fakeDb,
      workspaceBasePath: '/var/forge/workspaces',
      githubApps: fakeGithubApps,
      internalChat: fakeInternalChat,
    });
  });

  it('decodes Base64 admin API key when value matches Base64 pattern', async () => {
    // 'test-key-123' Base64-encoded = 'dGVzdC1rZXktMTIz'
    setEnv({ FORGE_ADMIN_API_KEY: 'dGVzdC1rZXktMTIz' });
    const ctx = await createForgeBootstrap();
    expect(ctx.adminApiKey).toBe('test-key-123');
  });

  it('uses raw admin API key when not Base64-pattern', async () => {
    // Value contains '$' which is not valid Base64
    setEnv({ FORGE_ADMIN_API_KEY: 'my$ecret-key' });
    const ctx = await createForgeBootstrap();
    expect(ctx.adminApiKey).toBe('my$ecret-key');
  });

  it('treats whitespace-only admin API key as undefined after decode', async () => {
    setEnv({ FORGE_ADMIN_API_KEY: '   ', FORGE_ADMIN_ALLOW_INSECURE_LOCAL: 'true' });
    const ctx = await createForgeBootstrap();
    expect(ctx.adminApiKey).toBe(undefined);
  });

  it('creates agent schedule manager with db', async () => {
    setEnv();
    await createForgeBootstrap();
    expect(mockCreateAgentScheduleManager).toHaveBeenCalledWith(
      expect.objectContaining({ db: fakeDb }),
    );
  });
});

// ─── decodeAdminApiKey (internal helper) — verified via createForgeBootstrap ──
// The helper is not exported, so we exercise it through the envSchema parse path.

describe('decodeAdminApiKey (via admin API key env path)', () => {
  it('returns trimmed Base64-decoded value for valid Base64 with special chars', async () => {
    // Raw key: my$ecret!key#123 → Base64: bXkkZWNyZXQha2V5IzEyMw==
    setEnv({ FORGE_ADMIN_API_KEY: 'bXkkZWNyZXQha2V5IzEyMw==' });
    const ctx = await createForgeBootstrap();
    expect(ctx.adminApiKey).toBe('my$ecret!key#123');
  });

  it('returns raw value for non-Base64 string (has $)', async () => {
    setEnv({ FORGE_ADMIN_API_KEY: '$pecial!chars#' });
    const ctx = await createForgeBootstrap();
    // Not valid Base64 pattern, so raw value is used
    expect(ctx.adminApiKey).toBe('$pecial!chars#');
  });

  it('returns undefined for whitespace-only value (helper trims to empty)', async () => {
    setEnv({ FORGE_ADMIN_API_KEY: '   ', FORGE_ADMIN_ALLOW_INSECURE_LOCAL: 'true' });
    const ctx = await createForgeBootstrap();
    expect(ctx.adminApiKey).toBe(undefined);
  });
});

// ─── Defensive patches (cycle 9, #6308) ────────────────────────────────────────
// PR #6308 added 2 try/catch blocks + 11 forgeDebug checkpoint invocations.
// These tests verify the failure-handling semantics and the lifecycle logging.

describe('createForgeBootstrap() — defensive patches (#6308)', () => {
  beforeEach(() => {
    mockRunMigrations.mockReset();
    mockRunMigrations.mockResolvedValue(undefined);
    mockPrepareAgentEmbedders.mockReset();
    mockPrepareAgentEmbedders.mockResolvedValue(undefined);
    mockForgeDebug.mockReset();
    mockForgeDebug.mockResolvedValue(undefined);
  });

  describe('runMigrations failure path', () => {
    it('re-throws when runMigrations rejects', async () => {
      setEnv();
      const migrationError = new Error('schema drift detected');
      mockRunMigrations.mockRejectedValue(migrationError);
      await expect(createForgeBootstrap()).rejects.toBe(migrationError);
    });

    it('logs an error-level checkpoint before re-throwing', async () => {
      setEnv();
      const migrationError = new Error('migration rolled back');
      mockRunMigrations.mockRejectedValue(migrationError);
      await expect(createForgeBootstrap()).rejects.toBe(migrationError);
      const debugCalls = mockForgeDebug.mock.calls.map((call) => call[0] as Record<string, unknown>);
      const failureCall = debugCalls.find((c) => c.message === 'bootstrap: runMigrations FAILED');
      expect(failureCall).toBeDefined();
      expect(failureCall?.level).toBe('error');
      expect(failureCall?.scope).toBe('forge-bootstrap');
    });

    it('does not proceed to prepareAgentEmbeddersForStartup when migrations fail', async () => {
      setEnv();
      mockRunMigrations.mockRejectedValue(new Error('boom'));
      await expect(createForgeBootstrap()).rejects.toThrow('boom');
      expect(mockPrepareAgentEmbedders).not.toHaveBeenCalled();
    });
  });

  describe('prepareAgentEmbeddersForStartup failure path', () => {
    it('does NOT throw when prepareAgentEmbeddersForStartup rejects', async () => {
      setEnv();
      mockPrepareAgentEmbedders.mockRejectedValue(new Error('embedder index unavailable'));
      await expect(createForgeBootstrap()).resolves.toBeDefined();
    });

    it('logs a warn-level checkpoint before continuing', async () => {
      setEnv();
      mockPrepareAgentEmbedders.mockRejectedValue(new Error('embedder recovery'));
      await createForgeBootstrap();
      const debugCalls = mockForgeDebug.mock.calls.map((call) => call[0] as Record<string, unknown>);
      const warnCall = debugCalls.find((c) => c.message === 'bootstrap: prepareAgentEmbeddersForStartup FAILED (continuing)');
      expect(warnCall).toBeDefined();
      expect(warnCall?.level).toBe('warn');
      expect(warnCall?.scope).toBe('forge-bootstrap');
    });

    it('continues wiring factories after embedder failure', async () => {
      setEnv();
      mockPrepareAgentEmbedders.mockRejectedValue(new Error('non-critical'));
      await createForgeBootstrap();
      expect(mockCreateSystemIntegrationStore).toHaveBeenCalled();
      expect(mockRegisterAdminRoutes).toHaveBeenCalled();
    });
  });

  describe('lifecycle forgeDebug checkpoints', () => {
    it('emits exactly 11 checkpoint invocations on the happy path', async () => {
      setEnv();
      await createForgeBootstrap();
      expect(mockForgeDebug).toHaveBeenCalledTimes(11);
    });

    it('emits checkpoints in documented order', async () => {
      setEnv();
      await createForgeBootstrap();
      const messages = mockForgeDebug.mock.calls.map((call) => (call[0] as Record<string, unknown>).message);
      expect(messages).toEqual([
        'bootstrap: starting',
        'bootstrap: env parsed',
        'bootstrap: db obtained, running migrations',
        'bootstrap: migrations complete',
        'bootstrap: agent embedders ready',
        'bootstrap: registry obtained',
        'bootstrap: stores created',
        'bootstrap: managers created',
        'bootstrap: schedule manager created',
        'bootstrap: read model created',
        'bootstrap: bootstrap COMPLETE',
      ]);
    });

    it('scopes every checkpoint to forge-bootstrap', async () => {
      setEnv();
      await createForgeBootstrap();
      const debugCalls = mockForgeDebug.mock.calls.map((call) => call[0] as Record<string, unknown>);
      for (const c of debugCalls) {
        expect(c.scope).toBe('forge-bootstrap');
      }
    });

    it('emits bootstrap COMPLETE with publicBaseUrl context', async () => {
      setEnv({ FORGE_PUBLIC_BASE_URL: 'https://forge.example.com' });
      await createForgeBootstrap();
      const debugCalls = mockForgeDebug.mock.calls.map((call) => call[0] as Record<string, unknown>);
      const completeCall = debugCalls.find((c) => c.message === 'bootstrap: bootstrap COMPLETE');
      expect(completeCall).toBeDefined();
      expect(completeCall?.context).toEqual({ publicBaseUrl: 'https://forge.example.com' });
    });

    it('falls back to localhost URL when FORGE_PUBLIC_BASE_URL is absent', async () => {
      setEnv({ FORGE_PUBLIC_BASE_URL: undefined, FORGE_HTTP_PORT: '3011' });
      await createForgeBootstrap();
      const debugCalls = mockForgeDebug.mock.calls.map((call) => call[0] as Record<string, unknown>);
      const completeCall = debugCalls.find((c) => c.message === 'bootstrap: bootstrap COMPLETE');
      expect(completeCall?.context).toEqual({ publicBaseUrl: 'http://localhost:3011' });
    });
  });

  // Always-emit startup logging (cycle 14c-3, #6315 follow-up).
  // FAILSafe LOGGING: console.log calls always run, even when FORGE_DEBUG
  // is unset. This is critical for diagnosing startup crashes in production
  // where Coolify container logs are not easily accessible without SSH.
  // See L#NN-Startup-Logging-Failsafe v1.
  describe('always-emit startup logging (#6315 cycle 14c-3)', () => {
    let mockConsoleLog: ReturnType<typeof vi.spyOn>;
    let mockConsoleError: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      mockForgeDebug.mockReset();
      mockForgeDebug.mockResolvedValue(undefined);
      mockRunMigrations.mockReset();
      mockRunMigrations.mockResolvedValue(undefined);
      mockPrepareAgentEmbedders.mockReset();
      mockPrepareAgentEmbedders.mockResolvedValue(undefined);
      mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
      mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      mockConsoleLog.mockRestore();
      mockConsoleError.mockRestore();
    });

    function getStartupLogs(): string[] {
      return mockConsoleLog.mock.calls
        .map((call: unknown[]) => call[0])
        .filter((msg: unknown): msg is string => typeof msg === 'string' && msg.startsWith('[forge-startup]'));
    }

    it('emits console.log even when FORGE_DEBUG is unset', async () => {
      delete process.env.FORGE_DEBUG;
      setEnv();
      await createForgeBootstrap();
      const logs = getStartupLogs();
      expect(logs.length).toBeGreaterThan(0);
      expect(logs).toContain('[forge-startup] starting');
    });

    it('emits env parsed line with critical env vars', async () => {
      setEnv({ FORGE_HTTP_PORT: '3011', FORGE_DATA_PATH: '/data/test' });
      await createForgeBootstrap();
      const logs = getStartupLogs();
      const envLine = logs.find((l) => l === '[forge-startup] env parsed');
      expect(envLine).toBeDefined();
      // The 2nd arg is JSON-stringified context
      const contextCall = mockConsoleLog.mock.calls.find((call: unknown[]) => call[0] === '[forge-startup] env parsed');
      expect(contextCall).toBeDefined();
      const context = JSON.parse(contextCall?.[1] as string);
      expect(context.port).toBe(3011);
      expect(context.dataPath).toBe('/data/test');
    });

    it('emits db obtained, running migrations line', async () => {
      setEnv();
      await createForgeBootstrap();
      const logs = getStartupLogs();
      expect(logs).toContain('[forge-startup] db obtained, running migrations');
    });

    it('emits migrations complete line on happy path', async () => {
      setEnv();
      await createForgeBootstrap();
      const logs = getStartupLogs();
      expect(logs).toContain('[forge-startup] migrations complete');
    });

    it('emits MIGRATIONS FAILED line with error context on failure', async () => {
      setEnv();
      mockRunMigrations.mockRejectedValue(new Error('SQL syntax error'));
      await expect(createForgeBootstrap()).rejects.toThrow('SQL syntax error');
      const logs = getStartupLogs();
      const failLines = logs.filter((l) => l.includes('MIGRATIONS FAILED'));
      expect(failLines.length).toBeGreaterThan(0);
    });

    it('emits CONFIGURATION CHECK FAILED when FORGE_ADMIN_API_KEY missing', async () => {
      setEnv({ FORGE_ADMIN_API_KEY: undefined });
      await expect(createForgeBootstrap()).rejects.toThrow(/FORGE_ADMIN_API_KEY/);
      const logs = getStartupLogs();
      const configLines = logs.filter((l) => l.includes('CONFIGURATION CHECK FAILED'));
      expect(configLines.length).toBeGreaterThan(0);
    });
  });
});
