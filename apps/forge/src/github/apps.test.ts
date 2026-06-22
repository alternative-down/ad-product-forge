/**
 * Unit tests for github/apps.ts — createAppProvisioningOps.
 * Covers: isConfigured, createAgentApp, getAgentProvisioning,
 *         updateAgentManifestConfig, loadAllAgents, unloadAgent,
 *         deleteAgentApp.
 * Zero prior coverage.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Mock @forge-runtime/core ────────────────────────────────────────────────

const { mockForgeDebug } = vi.hoisted(() => ({
  mockForgeDebug: vi.fn(),
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,

    errorMsg: vi.fn((err) => err instanceof Error ? err.message : typeof err === "string" ? err : String(err).replace(/^Error: /, "")),
    withToolErrorLogging: vi.fn(async (params) => {
      try {
        return { valid: true, data: await params.fn() };
      } catch (error) {
        // Mirror the real impl: use errorMsg-style formatting
        const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error).replace(/^Error: /, '');
        return { valid: false, error: msg, hint: params.hint || '' };
      }
    }),
  }));

// ─── Test helpers ───────────────────────────────────────────────────────────

function makeMockCtx(
  overrides: {
    getGlobalConfigValue?: unknown; // what the function resolves to
    credentialsValue?: unknown;
    dbFindMany?: ReturnType<typeof vi.fn>;
    dbDelete?: ReturnType<typeof vi.fn>;
    nanoid?: ReturnType<typeof vi.fn>;
    saveCredentials?: ReturnType<typeof vi.fn>;
    opsRouting?: unknown;
    normalizeManifestConfig?: (raw: unknown) => unknown;
  } = {},
) {
  const mockGetGlobalConfig = vi
    .fn()
    .mockResolvedValue(
      overrides.getGlobalConfigValue !== undefined
        ? overrides.getGlobalConfigValue
        : { organization: 'test-org', appHomeUrl: 'http://localhost' },
    );
  const mockGetCredentials = vi.fn().mockResolvedValue(overrides.credentialsValue ?? null);
  const mockSaveCredentials = overrides.saveCredentials ?? vi.fn();
  const mockNanoid = overrides.nanoid ?? (() => 'mock-state');
  const mockParseCredentials = vi.fn();
  const routeCleanups = new Map<string, Array<() => void>>();

  const mockDb = {
    query: {
      agentProviders: {
        findMany: overrides.dbFindMany ?? vi.fn().mockResolvedValue([]),
      },
    },
    delete:
      overrides.dbDelete ??
      vi.fn(() => ({
        where: vi.fn().mockResolvedValue({}),
      })),
  };

  return {
    mockGetGlobalConfig,
    mockGetCredentials,
    mockSaveCredentials,
    mockParseCredentials,
    mockDb,
    ctx: {
      getGlobalConfig: mockGetGlobalConfig,
      getDefaultOwner: vi.fn().mockResolvedValue('test-owner'),
      getCredentials: mockGetCredentials,
      getActiveCredentials: vi.fn(),
      saveCredentials: mockSaveCredentials,
      parseCredentials: mockParseCredentials,
      createInstallationOctokit: vi.fn(),
      createGitHubApp: vi.fn(),
      getInstallationOctokit: vi.fn(),
      getInstallationToken: vi.fn(),
      routeCleanups,
      GITHUB_PROVIDER_TYPE: 'github',
      and: (a: unknown, b: unknown) => ({ type: 'and', a, b }),
      eq: (col: unknown, val: unknown) => ({ type: 'eq', col, val }),
      agentProviders: { __name: 'agentProviders' } as any,
      agents: { __name: 'agents' } as any,
      createId: () => 'id-' + Date.now(),
      nanoid: mockNanoid,
      createAppName: (agentId: string, name: string) => `${name}-${agentId}`,
      forgeDebug: mockForgeDebug,
      normalizeManifestConfig: overrides.normalizeManifestConfig ?? ((raw: unknown) => raw),
      DEFAULT_GITHUB_APP_MANIFEST_CONFIG: { default: true },
      opsRouting: overrides.opsRouting ?? {
        buildProvisioning: vi.fn((agentId: string, creds: unknown) => ({
          provisioning: true,
          agentId,
          status: (creds as any)?.status ?? 'unknown',
        })),
        registerAgentRoutes: vi.fn(),
      },
      config: {
        db: mockDb,
        httpServer: {},
        publicBaseUrl: 'http://localhost',
        integrations: null as any,
      },
      notifications: null as any,
    },
  };
}

// ─── Import after mocks ────────────────────────────────────────────────────

import { createAppProvisioningOps } from './apps';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('createAppProvisioningOps', () => {
  beforeEach(() => {
    mockForgeDebug.mockImplementation(() => {});
    mockForgeDebug.mockClear();
  });

  describe('isConfigured', () => {
    it('returns true when getGlobalConfig resolves to an object', async () => {
      const { ctx, mockGetGlobalConfig } = makeMockCtx({
        getGlobalConfigValue: { organization: 'acme', appHomeUrl: 'https://app.acme.com' },
      });
      const ops = createAppProvisioningOps(ctx as any);
      const result = await ops.isConfigured();
      expect(result).toBe(true);
      expect(mockGetGlobalConfig).toHaveBeenCalledOnce();
    });

    it('returns false when getGlobalConfig resolves to null', async () => {
      const { ctx, mockGetGlobalConfig } = makeMockCtx({
        getGlobalConfigValue: null,
      });
      mockGetGlobalConfig.mockResolvedValueOnce(null);
      const ops = createAppProvisioningOps(ctx as any);
      const result = await ops.isConfigured();
      expect(result).toBe(false);
    });

    it('returns false when getGlobalConfig resolves to undefined', async () => {
      const { ctx, mockGetGlobalConfig } = makeMockCtx({
        getGlobalConfigValue: { organization: 't', appHomeUrl: 'http://x' },
      });
      mockGetGlobalConfig.mockResolvedValueOnce(undefined);
      const ops = createAppProvisioningOps(ctx as any);
      const result = await ops.isConfigured();
      expect(result).toBe(false);
    });
  });

  describe('createAgentApp', () => {
    it('throws when agent already has credentials', async () => {
      const { ctx } = makeMockCtx({
        credentialsValue: { status: 'active', appId: 1, installationId: 1 },
      });
      const ops = createAppProvisioningOps(ctx as any);

      await expect(
        ops.createAgentApp({ agentId: 'agent-1', agentName: 'My Agent' }),
      ).rejects.toThrow('already has GitHub credentials');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn', message: 'GitHub App already exists for agent' }),
      );
    });

    it('saves pending credentials and registers routes when agent is new', async () => {
      const { ctx, mockSaveCredentials } = makeMockCtx();
      const ops = createAppProvisioningOps(ctx as any);

      await ops.createAgentApp({ agentId: 'agent-new', agentName: 'Fresh Agent' });

      expect(mockSaveCredentials).toHaveBeenCalledWith(
        'agent-new',
        expect.objectContaining({ status: 'pending' }),
      );
      expect((ctx as any).opsRouting.registerAgentRoutes).toHaveBeenCalledWith('agent-new');
    });

    it('builds provisioning with pending credentials', async () => {
      const { ctx } = makeMockCtx();
      const ops = createAppProvisioningOps(ctx as any);

      const result = await ops.createAgentApp({ agentId: 'agent-test', agentName: 'Test' });

      expect((ctx as any).opsRouting.buildProvisioning).toHaveBeenCalledWith(
        'agent-test',
        expect.objectContaining({ status: 'pending' }),
      );
      expect((result as any).provisioning).toBe(true);
    });

    it('logs error on failure', async () => {
      const { ctx, mockGetCredentials } = makeMockCtx();
      mockGetCredentials.mockRejectedValueOnce(new Error('DB failure'));
      const ops = createAppProvisioningOps(ctx as any);

      await expect(ops.createAgentApp({ agentId: 'agent-1', agentName: 'A' })).rejects.toThrow(
        'DB failure',
      );
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('createAgentApp failed'),
        }),
      );
    });
  });

  describe('getAgentProvisioning', () => {
    it('returns null when not configured and no credentials', async () => {
      const { ctx } = makeMockCtx({
        getGlobalConfigValue: null,
        credentialsValue: null,
      });
      const ops = createAppProvisioningOps(ctx as any);
      const result = await ops.getAgentProvisioning('agent-1');
      expect(result).toBeNull();
    });

    it('builds provisioning with existing credentials when present', async () => {
      const creds = { status: 'active' as const, appId: 1, installationId: 1 };
      const { ctx } = makeMockCtx({ credentialsValue: creds });
      const ops = createAppProvisioningOps(ctx as any);

      const result = await ops.getAgentProvisioning('agent-1');

      expect((ctx as any).opsRouting.buildProvisioning).toHaveBeenCalledWith('agent-1', creds);
      expect(result).toEqual(expect.objectContaining({ provisioning: true }));
    });

    it('builds pending credentials when configured but no credentials', async () => {
      const { ctx } = makeMockCtx({
        getGlobalConfigValue: { organization: 'test', appHomeUrl: 'http://localhost' },
        credentialsValue: null,
      });
      const ops = createAppProvisioningOps(ctx as any);

      const result = await ops.getAgentProvisioning('agent-unconfigured');

      expect((ctx as any).opsRouting.buildProvisioning).toHaveBeenCalledWith(
        'agent-unconfigured',
        expect.objectContaining({ status: 'pending' }),
      );
      expect(result).not.toBeNull();
    });
  });

  describe('updateAgentManifestConfig', () => {
    it('throws when agent has no existing credentials', async () => {
      const { ctx } = makeMockCtx({ credentialsValue: null });
      const ops = createAppProvisioningOps(ctx as any);

      await expect(
        ops.updateAgentManifestConfig({
          agentId: 'agent-1',
          manifestConfig: { permissions: [] } as any,
        }),
      ).rejects.toThrow('no GitHub credentials to update');

      expect(mockForgeDebug).toHaveBeenCalled();
      expect(mockForgeDebug.mock.calls[0][0]).toMatchObject({
        level: 'warn',
        message: expect.stringContaining('no credentials'),
      });
    });

    it('saves updated credentials when existing found', async () => {
      const existing = {
        status: 'active' as const,
        appId: 1,
        installationId: 1,
        state: 'old',
        appName: 'Old',
        manifestConfig: { permissions: [] } as any,
        createdAt: Date.now(),
      };
      const { ctx, mockSaveCredentials } = makeMockCtx({ credentialsValue: existing });
      const ops = createAppProvisioningOps(ctx as any);

      await ops.updateAgentManifestConfig({
        agentId: 'agent-1',
        manifestConfig: { permissions: ['repo'] } as any,
      });

      expect(mockSaveCredentials).toHaveBeenCalledWith(
        'agent-1',
        expect.objectContaining({ status: 'active' }),
      );
    });

    it('logs error on failure', async () => {
      const { ctx, mockGetCredentials } = makeMockCtx({});
      mockGetCredentials.mockRejectedValueOnce(new Error('Config error'));
      const ops = createAppProvisioningOps(ctx as any);

      await expect(
        ops.updateAgentManifestConfig({
          agentId: 'agent-1',
          manifestConfig: {} as any,
        }),
      ).rejects.toThrow('Config error');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('updateAgentManifestConfig failed'),
        }),
      );
    });
  });

  describe('loadAllAgents', () => {
    it('returns empty array when no provider rows', async () => {
      const { ctx } = makeMockCtx();
      const ops = createAppProvisioningOps(ctx as any);
      const result = await ops.loadAllAgents();
      expect(result).toEqual([]);
    });

    it('filters out rows where parseCredentials returns null', async () => {
      const { ctx, mockParseCredentials } = makeMockCtx({
        dbFindMany: vi
          .fn()
          .mockResolvedValue([
            { agentId: 'a1', encryptedCredentials: 'invalid', providerType: 'github' },
          ]),
      });
      mockParseCredentials.mockReturnValue(null);
      const ops = createAppProvisioningOps(ctx as any);

      const result = await ops.loadAllAgents();
      expect(result).toEqual([]);
    });

    it('includes rows where parseCredentials returns valid credentials', async () => {
      const parsedCreds = { status: 'active', appId: 1, installationId: 1 } as any;
      const { ctx, mockParseCredentials } = makeMockCtx({
        dbFindMany: vi
          .fn()
          .mockResolvedValue([
            { agentId: 'agent-1', encryptedCredentials: 'valid-token', providerType: 'github' },
          ]),
      });
      mockParseCredentials.mockReturnValue(parsedCreds);
      const ops = createAppProvisioningOps(ctx as any);

      const result = await ops.loadAllAgents();
      expect(result).toEqual([{ agentId: 'agent-1', credentials: parsedCreds }]);
    });

    it('logs error on DB failure', async () => {
      const { ctx } = makeMockCtx({
        dbFindMany: vi.fn().mockRejectedValue(new Error('Query failed')),
      });
      const ops = createAppProvisioningOps(ctx as any);

      await expect(ops.loadAllAgents()).rejects.toThrow('Query failed');
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: expect.stringContaining('loadAllAgents failed'),
        }),
      );
    });
  });

  describe('unloadAgent', () => {
    it('does nothing when agentId not in registry', () => {
      const { ctx } = makeMockCtx();
      const ops = createAppProvisioningOps(ctx as any);
      expect(() => ops.unloadAgent('ghost-agent')).not.toThrow();
    });

    it('calls cleanup functions and removes entry', () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      const { ctx } = makeMockCtx();
      ctx.routeCleanups.set('agent-1', [cleanup1, cleanup2]);
      const ops = createAppProvisioningOps(ctx as any);

      ops.unloadAgent('agent-1');

      expect(cleanup1).toHaveBeenCalledTimes(1);
      expect(cleanup2).toHaveBeenCalledTimes(1);
      expect(ctx.routeCleanups.has('agent-1')).toBe(false);
    });
  });

  describe('deleteAgentApp', () => {
    it('does nothing when credentials is null', async () => {
      const { ctx } = makeMockCtx({ credentialsValue: null });
      const ops = createAppProvisioningOps(ctx as any);
      await ops.deleteAgentApp('agent-1');
      expect(ctx.config.db.delete).not.toHaveBeenCalled();
    });

    it('does nothing when status is not active', async () => {
      const { ctx } = makeMockCtx({ credentialsValue: { status: 'pending' } });
      const ops = createAppProvisioningOps(ctx as any);
      await ops.deleteAgentApp('agent-1');
      expect(ctx.config.db.delete).not.toHaveBeenCalled();
    });
  });
});
