import { describe, expect, it, vi } from 'vitest';
import type { createSystemIntegrationStore } from '../../system-integrations/store';

// ─── Mock setup (must be at module level via vi.hoisted) ──────────────────────
const forgeDebug = vi.hoisted(() => vi.fn<() => void>());
vi.mock('@forge-runtime/core', () => ({ forgeDebug }));

// ─── Mock fetch ───────────────────────────────────────────────────────────────
const mockFetch = vi.hoisted(() => vi.fn());

vi.stubGlobal('fetch', mockFetch);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const BASE_URL = 'https://coolify.example.com/api/v1';

const mockIntegration = {
  baseUrl: BASE_URL,
  adminToken: 'test-token-abc123',
  serverId: 'server-uuid-001',
  destinationId: 'dest-uuid-002',
  applicationsBaseDomain: 'app.example.com',
};

function buildMockFetch(data: unknown, init?: ResponseInit) {
  return vi.mocked(mockFetch).mockResolvedValueOnce({
    ok: init?.status ? init.status >= 200 && init.status < 300 : true,
    status: init?.status ?? 200,
    statusText: init?.statusText ?? 'OK',
    headers: new Headers({ 'content-type': 'application/json' }),
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
  } as unknown as Response);
}

function buildMockResponse(data: unknown, extra?: Record<string, unknown>) {
  return { ...data, ...extra };
}

// ─── Store mock ──────────────────────────────────────────────────────────────
function createMockStore() {
  return {
    listIntegrations: vi.fn().mockResolvedValue([]),
    upsertIntegration: vi.fn().mockResolvedValue(undefined),
    deleteIntegration: vi.fn().mockResolvedValue(true),
    getDiscordConfig: vi.fn().mockResolvedValue(null),
    getSlackConfig: vi.fn().mockResolvedValue(null),
    getMicrosoftTeamsConfig: vi.fn().mockResolvedValue(null),
    getCoolifyConfig: vi.fn<() => Promise<typeof mockIntegration>>(),
  };
}

// ─── Imports after mocks ─────────────────────────────────────────────────────
const { createCoolifyManager } = await import('./manager');

describe('createCoolifyManager', () => {
  let store: ReturnType<typeof createMockStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = createMockStore();
    vi.mocked(store.getCoolifyConfig).mockResolvedValue(mockIntegration);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getCredentials
  // ──────────────────────────────────────────────────────────────────────────
  describe('getCredentials', () => {
    it('returns normalised credentials from the integration config', async () => {
      buildMockFetch(null);
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const creds = await manager.getCredentials();

      expect(creds).toEqual({
        baseUrl: `${BASE_URL}/api/v1`,
        apiToken: mockIntegration.adminToken,
        serverId: mockIntegration.serverId,
        destinationId: mockIntegration.destinationId,
        applicationsBaseDomain: mockIntegration.applicationsBaseDomain,
      });
    });

    it('returns null applicationsBaseDomain when integration omits it', async () => {
      vi.mocked(store.getCoolifyConfig).mockResolvedValue({ ...mockIntegration, applicationsBaseDomain: '' });
      buildMockFetch(null);
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const creds = await manager.getCredentials();
      expect(creds.applicationsBaseDomain).toBeNull();
    });

    it('throws when no coolify integration is configured', async () => {
      vi.mocked(store.getCoolifyConfig).mockResolvedValue(null);
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      await expect(manager.getCredentials()).rejects.toThrow('Coolify integration requires a configured admin connection');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listGitHubApps
  // ──────────────────────────────────────────────────────────────────────────
  describe('listGitHubApps', () => {
    it('returns empty array when no apps exist', async () => {
      buildMockFetch(buildMockResponse([]));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const apps = await manager.listGitHubApps();
      expect(apps).toEqual([]);
    });

    it('maps raw API response to shaped output', async () => {
      buildMockFetch(buildMockResponse({
        github_apps: [
          {
            uuid: 'app-uuid-1',
            id: 42,
            name: 'MyApp',
            organization: 'acme',
            api_url: 'https://api.github.com',
            html_url: 'https://github.com/apps/myapp',
          },
        ],
      }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const apps = await manager.listGitHubApps();

      expect(apps).toHaveLength(1);
      expect(apps[0]).toEqual({
        githubAppId: 42,
        githubAppUuid: 'app-uuid-1',
        name: 'MyApp',
        organization: 'acme',
        apiUrl: 'https://api.github.com',
        htmlUrl: 'https://github.com/apps/myapp',
      });
    });

    it('falls back to uuid when id is absent', async () => {
      buildMockFetch(buildMockResponse({ github_apps: [{ uuid: 'uuid-only-app' }] }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const apps = await manager.listGitHubApps();
      expect(apps[0].githubAppId).toBe('uuid-only-app');
    });

    it('uses empty string when name is absent', async () => {
      buildMockFetch(buildMockResponse({ github_apps: [{ uuid: 'app-uuid-1' }] }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const apps = await manager.listGitHubApps();
      expect(apps[0].name).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createGitHubApp
  // ──────────────────────────────────────────────────────────────────────────
  describe('createGitHubApp', () => {
    it('posts correct payload and returns shaped result', async () => {
      buildMockFetch(buildMockResponse({
        uuid: 'new-app-uuid',
        id: 99,
        name: 'NewApp',
        organization: 'acme',
      }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const result = await manager.createGitHubApp({
        name: 'NewApp',
        organization: 'acme',
        appId: '99',
        installationId: '100',
        clientId: 'client-id',
        clientSecret: 'client-secret',
        webhookSecret: 'webhook-secret',
        privateKey: '-----BEGIN RSA...',
      });

      expect(result).toEqual({
        githubAppId: 99,
        githubAppUuid: 'new-app-uuid',
        name: 'NewApp',
        organization: 'acme',
      });

      // Verify POST payload
      const fetchCall = vi.mocked(mockFetch).mock.calls[0];
      const [, init] = fetchCall as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.name).toBe('NewApp');
      expect(body.organization).toBe('acme');
      expect(body.app_id).toBe('99');
      expect(body.installation_id).toBe('100');
      expect(body.client_id).toBe('client-id');
      expect(body.client_secret).toBe('client-secret');
      expect(body.webhook_secret).toBe('webhook-secret');
      expect(body.private_key).toBe('-----BEGIN RSA...');
      expect(body.api_url).toBe('https://api.github.com');
      expect(body.html_url).toBe('https://github.com');
    });

    it('uses provided apiUrl and htmlUrl when supplied', async () => {
      buildMockFetch(buildMockResponse({ uuid: 'u', name: 'n', organization: 'o' }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      await manager.createGitHubApp({
        name: 'n', organization: 'o', appId: '1', installationId: '2',
        clientId: '3', clientSecret: '4', webhookSecret: '5', privateKey: '6',
        apiUrl: 'https://ghe.acme.com/api/v3',
        htmlUrl: 'https://ghe.acme.com',
      });

      const fetchCall = vi.mocked(mockFetch).mock.calls[0];
      const [, init] = fetchCall as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.api_url).toBe('https://ghe.acme.com/api/v3');
      expect(body.html_url).toBe('https://ghe.acme.com');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listGitHubAppRepositories
  // ──────────────────────────────────────────────────────────────────────────
  describe('listGitHubAppRepositories', () => {
    it('maps repository fields correctly', async () => {
      buildMockFetch(buildMockResponse({
        repositories: [
          {
            id: 101,
            name: 'repo-one',
            full_name: 'acme/repo-one',
            default_branch: 'main',
            private: true,
          },
        ],
      }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const repos = await manager.listGitHubAppRepositories({ githubAppId: 'my-app-uuid' });

      expect(repos).toHaveLength(1);
      expect(repos[0]).toEqual({
        repositoryId: 101,
        name: 'repo-one',
        fullName: 'acme/repo-one',
        defaultBranch: 'main',
        private: true,
      });
    });

    it('uses full_name as repositoryId when id is absent', async () => {
      buildMockFetch(buildMockResponse({ repositories: [{ name: 'repo-x', full_name: 'acme/repo-x' }] }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const repos = await manager.listGitHubAppRepositories({ githubAppId: 'app-uuid' });
      expect(repos[0].repositoryId).toBe('acme/repo-x');
    });

    it('returns empty array when response has no repositories', async () => {
      buildMockFetch(buildMockResponse({}));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const repos = await manager.listGitHubAppRepositories({ githubAppId: 'app' });
      expect(repos).toEqual([]);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listGitHubAppRepositoryBranches
  // ──────────────────────────────────────────────────────────────────────────
  describe('listGitHubAppRepositoryBranches', () => {
    it('returns branch names', async () => {
      buildMockFetch(buildMockResponse({ branches: [{ name: 'main' }, { name: 'develop' }] }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const branches = await manager.listGitHubAppRepositoryBranches({
        githubAppId: 'app-uuid',
        repositoryName: 'my-repo',
      });

      expect(branches).toEqual([{ name: 'main' }, { name: 'develop' }]);
    });

    it('encodes repository name in URL', async () => {
      buildMockFetch(buildMockResponse({ branches: [] }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      await manager.listGitHubAppRepositoryBranches({ githubAppId: 'a', repositoryName: 'my/repo' });

      const url = vi.mocked(mockFetch).mock.calls[0][0] as string;
      expect(url).toContain('repository=my%2Frepo');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listApplications
  // ──────────────────────────────────────────────────────────────────────────
  describe('listApplications', () => {
    it('returns application summaries', async () => {
      buildMockFetch(buildMockResponse({
        applications: [{
          uuid: 'app-uuid-1',
          name: 'Forge App',
          fqdn: 'forge.app.example.com',
          status: 'running',
          repository: 'acme/forge',
          git_branch: 'main',
        }],
      }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const apps = await manager.listApplications();

      expect(apps).toEqual([{
        applicationUuid: 'app-uuid-1',
        name: 'Forge App',
        fqdn: 'forge.app.example.com',
        status: 'running',
        repository: 'acme/forge',
        branch: 'main',
      }]);
    });

    it('handles null fields gracefully', async () => {
      buildMockFetch(buildMockResponse({ applications: [{ uuid: 'u', name: null, fqdn: null }] }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const apps = await manager.listApplications();
      expect(apps[0]).toEqual({
        applicationUuid: 'u',
        name: null,
        fqdn: null,
        status: null,
        repository: null,
        branch: null,
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getApplication
  // ──────────────────────────────────────────────────────────────────────────
  describe('getApplication', () => {
    it('returns application details including port', async () => {
      buildMockFetch(buildMockResponse({
        uuid: 'app-uuid-1',
        name: 'MyApp',
        fqdn: 'myapp.example.com',
        status: 'idle',
        repository: 'acme/myapp',
        git_branch: 'develop',
        ports_exposes: '3000',
      }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const app = await manager.getApplication('app-uuid-1');

      expect(app).toEqual({
        applicationUuid: 'app-uuid-1',
        name: 'MyApp',
        fqdn: 'myapp.example.com',
        status: 'idle',
        repository: 'acme/myapp',
        branch: 'develop',
        port: '3000',
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Application lifecycle methods (start / stop / restart / delete)
  // ──────────────────────────────────────────────────────────────────────────
  describe('startApplication', () => {
    it('returns success', async () => {
      buildMockFetch(buildMockResponse(null));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const result = await manager.startApplication('app-uuid-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('stopApplication', () => {
    it('returns success', async () => {
      buildMockFetch(buildMockResponse(null));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const result = await manager.stopApplication('app-uuid-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('restartApplication', () => {
    it('returns success', async () => {
      buildMockFetch(buildMockResponse(null));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const result = await manager.restartApplication('app-uuid-1');
      expect(result).toEqual({ success: true });
    });
  });

  describe('deleteApplication', () => {
    it('returns success', async () => {
      buildMockFetch(buildMockResponse(null));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const result = await manager.deleteApplication('app-uuid-1');
      expect(result).toEqual({ success: true });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getApplicationLogs
  // ──────────────────────────────────────────────────────────────────────────
  describe('getApplicationLogs', () => {
    it('extracts logs from "logs" key', async () => {
      buildMockFetch(buildMockResponse({ logs: 'Build started\nCompiling...\nDone.' }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const result = await manager.getApplicationLogs({ applicationUuid: 'app-uuid-1' });

      expect(result.applicationUuid).toBe('app-uuid-1');
      expect(result.logs).toBe('Build started\nCompiling...\nDone.');
    });

    it('extracts logs from "data" key when "logs" is absent', async () => {
      buildMockFetch(buildMockResponse({ data: 'some log output' }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const result = await manager.getApplicationLogs({ applicationUuid: 'app-uuid-1' });
      expect(result.logs).toBe('some log output');
    });

    it('extracts logs from "output" key as fallback', async () => {
      buildMockFetch(buildMockResponse({ output: 'pipeline output' }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const result = await manager.getApplicationLogs({ applicationUuid: 'app-uuid-1' });
      expect(result.logs).toBe('pipeline output');
    });

    it('returns empty string when no logs key exists', async () => {
      buildMockFetch(buildMockResponse({ other: 'field' }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      const result = await manager.getApplicationLogs({ applicationUuid: 'app-uuid-1' });
      expect(result.logs).toBe('');
    });

    it('appends lines query param when lines is provided', async () => {
      buildMockFetch(buildMockResponse({ logs: '' }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      await manager.getApplicationLogs({ applicationUuid: 'app', lines: 100 });

      const url = vi.mocked(mockFetch).mock.calls[0][0] as string;
      expect(url).toContain('lines=100');
    });

    it('appends since query param when since is provided', async () => {
      buildMockFetch(buildMockResponse({ logs: '' }));
      const manager = createCoolifyManager({ integrations: store as ReturnType<typeof createSystemIntegrationStore> });
      await manager.getApplicationLogs({ applicationUuid: 'app', since: 1700000000 });

      const url = vi.mocked(mockFetch).mock.calls[0][0] as string;
      expect(url).toContain('since=1700000000');
    });
  });
});
