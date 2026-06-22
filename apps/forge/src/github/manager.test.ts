import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDecryptSecret = vi.fn();
const mockEncryptSecret = vi.fn();

vi.mock('@octokit/auth-app', () => ({
  createAppAuth: vi.fn(),
}));

vi.mock('octokit', () => ({
  App: vi.fn(),
  Octokit: vi.fn(),
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  errorMsg: vi.fn((err) => err instanceof Error ? err.message : typeof err === "string" ? err : String(err).replace(/^Error: /, "")),
  withToolErrorLogging: vi.fn(async (params) => {
    try {
      return { valid: true, data: await params.fn() };
    } catch (error) {
      // Mirror the real impl: use errorMsg-style formatting
      const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : String(error).replace(/^Error: /, '');
      return { valid: false, error: msg, hint: params.hint || '' };
    }
  })
}));

vi.mock('../notifications/store', () => ({
  createAgentNotificationStore: vi.fn(() => ({ createNotification: vi.fn() })),
}));

vi.mock('../encryption/crypto', () => ({
  decryptSecret: (...args: unknown[]) => mockDecryptSecret(...args),
  encryptSecret: (...args: unknown[]) => mockEncryptSecret(...args),
}));

import { createGitHubAppManager } from './manager';

function createMockDb(overrides?: {
  agentProvidersFindFirst?: unknown;
  agentProvidersFindMany?: unknown[];
  agentsFindFirst?: unknown;
}) {
  const db = {
    query: {
      agentProviders: {
        findFirst: vi.fn().mockResolvedValue(overrides?.agentProvidersFindFirst ?? null),
        findMany: vi.fn().mockResolvedValue(overrides?.agentProvidersFindMany ?? []),
      },
      agents: {
        findFirst: vi.fn().mockResolvedValue(overrides?.agentsFindFirst ?? null),
      },
    },
  };

  (db as unknown as Record<string, unknown>).insert = vi.fn(() => ({
    values: vi.fn().mockResolvedValue({ rowid: 1 }),
  }));

  (db as unknown as Record<string, unknown>).update = vi.fn(() => ({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue({}),
    }),
  }));

  return db as unknown as any;
}

function createMockIntegrations(getGitHubConfigMock: unknown) {
  return {
    getGitHubConfig: vi.fn().mockResolvedValue(getGitHubConfigMock),
  };
}

function createMockHttpServer() {
  return {
    registerRoute: vi.fn(),
    route: vi.fn(),
  };
}

function createConfig(githubConfig: unknown = null) {
  return {
    db: createMockDb(),
    httpServer: createMockHttpServer(),
    publicBaseUrl: 'https://forge.example.com',
    integrations: createMockIntegrations(githubConfig),
  };
}

const DEFAULT_MANIFEST_CONFIG = {
  permissions: {
    administration: true,
    contents: true,
    issues: true,
    metadata: false,
    organization_projects: false,
    pull_requests: true,
    repository_projects: false,
    workflows: false,
  },
  events: {
    push: true,
    pull_request: false,
    pull_request_review: false,
    issues: false,
    issue_comment: false,
    repository: false,
    workflow_run: false,
  },
  callbackUrl: '',
  redirectUrl: '',
  requestUrl: '',
  setupUrl: '',
  publicHomepageUrl: '',
  description: '',
};

describe('createGitHubAppManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDecryptSecret.mockReset();
    mockEncryptSecret.mockReset();
  });

  describe('isConfigured', () => {
    it('returns true when GitHub integration is configured', async () => {
      const config = createConfig({ organization: 'my-org' });
      const manager = createGitHubAppManager(config as any);
      await expect(manager.isConfigured()).resolves.toBe(true);
    });

    it('returns false when GitHub integration is not configured', async () => {
      const config = createConfig(null);
      const manager = createGitHubAppManager(config as any);
      await expect(manager.isConfigured()).resolves.toBe(false);
    });
  });

  describe('getAgentProvisioning', () => {
    it('returns provisioning when credentials already exist for agent', async () => {
      mockDecryptSecret.mockReturnValue(
        JSON.stringify({
          status: 'active',
          appId: 123,
          privateKey: 'pem-data',
          webhookSecret: 'secret',
          appSlug: 'my-app',
          appName: 'My App',
          manifestConfig: DEFAULT_MANIFEST_CONFIG,
          installationId: 456,
          createdAt: Date.now(),
        }),
      );

      const db = createMockDb({
        agentProvidersFindFirst: {
          id: 'prov-1',
          agentId: 'agent-1',
          providerType: 'github-app',
          encryptedCredentials: 'e30=',
        },
      });
      const config = createConfig({ organization: 'my-org', appHomeUrl: 'https://example.com' });
      config.db = db;

      const manager = createGitHubAppManager(config as any);
      const result = await manager.getAgentProvisioning('agent-1');

      expect(result).toMatchObject({
        agentId: 'agent-1',
        status: 'active',
      });
    });

    it('creates new provisioning when agent has no credentials but is configured', async () => {
      const db = createMockDb({
        agentProvidersFindFirst: null,
        agentsFindFirst: { id: 'agent-new', name: 'Test Agent' },
      });
      const config = createConfig({ organization: 'my-org', appHomeUrl: 'https://example.com' });
      config.db = db;

      const manager = createGitHubAppManager(config as any);
      const result = await manager.getAgentProvisioning('agent-new');

      expect(result).toMatchObject({ agentId: 'agent-new', status: 'pending' });
      expect((result as any).registrationUrl).toContain('agent-new');
    });

    it('returns null when not configured and agent has no credentials', async () => {
      const db = createMockDb({ agentProvidersFindFirst: null });
      const config = createConfig(null);
      config.db = db;

      const manager = createGitHubAppManager(config as any);
      await expect(manager.getAgentProvisioning('agent-unknown')).resolves.toBeNull();
    });
  });

  describe('createAgentApp', () => {
    it('creates a pending provisioning for a new agent', async () => {
      const db = createMockDb();
      const config = createConfig({ organization: 'my-org', appHomeUrl: 'https://example.com' });
      config.db = db;

      const manager = createGitHubAppManager(config as any);
      const result = await manager.createAgentApp({
        agentId: 'agent-fresh',
        agentName: 'Fresh Agent',
      });

      expect(result).toMatchObject({ agentId: 'agent-fresh', status: 'pending' });
      expect((result as any).registrationUrl).toContain('agent-fresh');
    });

    it('throws when credentials already exist for the agent', async () => {
      mockDecryptSecret.mockReturnValue(
        JSON.stringify({
          status: 'pending',
          state: 'some-state',
          appName: 'Existing App',
          manifestConfig: DEFAULT_MANIFEST_CONFIG,
          createdAt: Date.now(),
        }),
      );

      const db = createMockDb({
        agentProvidersFindFirst: {
          id: 'prov-1',
          agentId: 'agent-existing',
          providerType: 'github-app',
          encryptedCredentials: 'e30=',
        },
      });
      const config = createConfig({ organization: 'my-org', appHomeUrl: 'https://example.com' });
      config.db = db;

      const manager = createGitHubAppManager(config as any);
      await expect(
        manager.createAgentApp({ agentId: 'agent-existing', agentName: 'Existing Agent' }),
      ).rejects.toThrow('GitHub App already exists for agent agent-existing');
    });
  });

  describe('loadAllAgents', () => {
    it('loads agents from provider records', async () => {
      mockDecryptSecret.mockReturnValue(
        JSON.stringify({
          status: 'active',
          appId: 123,
          privateKey: 'pem',
          webhookSecret: 'w',
          appSlug: 'slug',
          appName: 'App',
          manifestConfig: DEFAULT_MANIFEST_CONFIG,
          installationId: 1,
          createdAt: Date.now(),
        }),
      );

      const db = createMockDb({
        agentProvidersFindMany: [
          {
            id: 'prov-1',
            agentId: 'agent-a',
            providerType: 'github-app',
            encryptedCredentials: 'e30=',
          },
          {
            id: 'prov-2',
            agentId: 'agent-b',
            providerType: 'github-app',
            encryptedCredentials: 'e30=',
          },
        ],
      });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;

      const manager = createGitHubAppManager(config as any);
      await manager.loadAllAgents();

      expect(config.db.query.agentProviders.findMany).toHaveBeenCalled();
    });

    it('skips records with unparseable credentials', async () => {
      mockDecryptSecret.mockImplementation(() => {
        throw new Error('bad data');
      });

      const db = createMockDb({
        agentProvidersFindMany: [
          {
            id: 'prov-bad',
            agentId: 'agent-bad',
            providerType: 'github-app',
            encryptedCredentials: 'bad',
          },
        ],
      });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;

      const manager = createGitHubAppManager(config as any);
      await manager.loadAllAgents();

      expect(config.db.query.agentProviders.findMany).toHaveBeenCalled();
    });
  });

  describe('getGitCredentials', () => {
    it('throws when agent credentials status is not active', async () => {
      mockDecryptSecret.mockReturnValue(
        JSON.stringify({
          status: 'created',
          appId: 123,
          privateKey: 'pem',
          webhookSecret: 'w',
          appSlug: 'slug',
          appName: 'App',
          manifestConfig: DEFAULT_MANIFEST_CONFIG,
          createdAt: Date.now(),
        }),
      );

      const db = createMockDb({
        agentProvidersFindFirst: {
          id: 'prov-1',
          agentId: 'agent-inactive',
          providerType: 'github-app',
          encryptedCredentials: 'e30=',
        },
      });
      const config = createConfig({ organization: 'my-org' });
      config.db = db;

      const manager = createGitHubAppManager(config as any);
      await expect(
        manager.getGitCredentials({ agentId: 'agent-inactive', repositoryName: 'my/repo' }),
      ).rejects.toThrow('GitHub App not active for agent agent-inactive');
    });

    it('throws when GitHub integration is not configured', async () => {
      const db = createMockDb();
      const config = createConfig(null);
      config.db = db;

      const manager = createGitHubAppManager(config as any);
      await expect(
        manager.getGitCredentials({ agentId: 'agent-1', repositoryName: 'my/repo' }),
      ).rejects.toThrow('GitHub integration is not configured');
    });
  });

  describe('updateAgentManifestConfig', () => {
    it('throws when agent has no existing credentials', async () => {
      const db = createMockDb({ agentProvidersFindFirst: null });
      const config = createConfig({ organization: 'my-org', appHomeUrl: 'https://example.com' });
      config.db = db;

      const manager = createGitHubAppManager(config as any);
      await expect(
        manager.updateAgentManifestConfig({
          agentId: 'agent-no-creds',
          manifestConfig: DEFAULT_MANIFEST_CONFIG,
        }),
      ).rejects.toThrow('GitHub App does not exist for agent agent-no-creds');
    });
  });
});
