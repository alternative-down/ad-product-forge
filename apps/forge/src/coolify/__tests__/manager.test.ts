import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
vi.mock('@forge-runtime/core', () => ({ forgeDebug: vi.fn() }));
import { createCoolifyManager } from '../manager';

const mockGetProviderConfig = vi.hoisted(() => vi.fn());

vi.mock('../provider-config', () => ({
  getProviderConfig: mockGetProviderConfig,
  getApplicationsBaseDomain: vi.fn(),
}));

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

const defaultConfig = {
  integrations: {
    getCoolifyConfig: vi.fn().mockResolvedValue({
      baseUrl: 'http://coolify.local',
      adminToken: 'tok123',
      serverId: 'srv-1',
      destinationId: 'dest-1',
      applicationsBaseDomain: 'example.com',
    }),
  },
};

const mockFetch = vi.fn();
globalThis.fetch = mockFetch as unknown as typeof fetch;

function nextResponse(data: unknown, status = 200) {
  mockFetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      statusText: status === 200 ? 'OK' : 'Error',
      text: async () => JSON.stringify(data),
    } as unknown as Response),
  );
}

function nextErrorResponse(status: number, data?: unknown) {
  mockFetch.mockImplementationOnce(() =>
    Promise.resolve({
      ok: false,
      status,
      statusText: 'Error',
      text: async () => JSON.stringify(data ?? { message: `HTTP ${status}` }),
    } as unknown as Response),
  );
}

const PROJECTS = { data: [{ uuid: 'proj-1', name: 'forge-default' }] };
const ENVIRONMENTS = { data: [{ uuid: 'env-1', name: 'production', project_uuid: 'proj-1' }] };
const SERVERS = { uuid: 'srv-1', name: 'main', wildcard_domain: '.example.com' };
const APP = {
  uuid: 'app-1', name: 'MyApp', fqdn: 'myapp.example.com',
  status: 'running', repository: 'org/repo', git_branch: 'main', ports_exposes: '3000',
};

function buildManager() {
  return createCoolifyManager(defaultConfig as Parameters<typeof createCoolifyManager>[0]);
}

describe('createCoolifyManager', () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue(undefined as unknown as Response);
    mockGetProviderConfig.mockReset();
    mockGetProviderConfig.mockResolvedValue({
      baseUrl: 'http://coolify.local',
      adminToken: 'tok123',
      serverId: 'srv-1',
      destinationId: 'dest-1',
      applicationsBaseDomain: 'example.com',
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  // ── getCredentials ──────────────────────────────────────────────────────────

  describe('getCredentials', () => {
    it('returns provider config credentials', async () => {
      const manager = buildManager();
      const creds = await manager.getCredentials();
      expect(creds.baseUrl).toBe('http://coolify.local');
      expect(creds.apiToken).toBe('tok123');
    });

    it('throws when config is not available', async () => {
      mockGetProviderConfig.mockRejectedValue(new Error('Coolify not configured'));
      const manager = buildManager();
      await expect(manager.getCredentials()).rejects.toThrow('Coolify not configured');
    });
  });

  // ── GitHub Apps ─────────────────────────────────────────────────────────────

  describe('listGitHubApps', () => {
    it('returns list of GitHub apps with mapped fields', async () => {
      nextResponse({ data: [{ id: 1, uuid: 'gu-1', name: 'GH App', organization: 'acme', api_url: 'https://api.gh.com', html_url: 'https://github.com/apps/gh' }] });
      const manager = buildManager();
      const apps = await manager.listGitHubApps();
      expect(apps).toHaveLength(1);
      expect(apps[0].name).toBe('GH App');
      expect(apps[0].githubAppId).toBe(1);
      expect(apps[0].githubAppUuid).toBe('gu-1');
      expect(apps[0].organization).toBe('acme');
    });

    it('returns empty array when no apps', async () => {
      nextResponse({ data: [] });
      const manager = buildManager();
      const apps = await manager.listGitHubApps();
      expect(apps).toHaveLength(0);
    });

    it('throws on API error', async () => {
      nextErrorResponse(500, { message: 'Server error' });
      const manager = buildManager();
      await expect(manager.listGitHubApps()).rejects.toThrow();
    });
  });

  describe('createGitHubApp', () => {
    it('creates a GitHub app and returns uuid', async () => {
      nextResponse({ uuid: 'new-gu-1' });
      const manager = buildManager();
      const result = await manager.createGitHubApp({
        name: 'New App', organization: 'acme',
        appId: '123', installationId: '456', webhookSecret: 'secret',
      });
      expect(result.githubAppUuid).toBe('new-gu-1');
    });

    it('throws on API error', async () => {
      nextErrorResponse(400, { message: 'Bad request' });
      const manager = buildManager();
      await expect(manager.createGitHubApp({ name: 'Bad', organization: 'o', appId: '1', installationId: '1', webhookSecret: 'x' })).rejects.toThrow();
    });
  });

  describe('listGitHubAppRepositories', () => {
    it('returns repository list with mapped fields', async () => {
      nextResponse({ data: [{ id: 1, name: 'repo1', full_name: 'org/repo1', default_branch: 'main', private: true }] });
      const manager = buildManager();
      const repos = await manager.listGitHubAppRepositories({ githubAppId: '1' });
      expect(repos).toHaveLength(1);
      expect(repos[0].name).toBe('repo1');
      expect(repos[0].fullName).toBe('org/repo1');
    });

    it('throws on 404', async () => {
      nextErrorResponse(404, { message: 'Not found' });
      const manager = buildManager();
      await expect(manager.listGitHubAppRepositories({ githubAppId: 'bad' })).rejects.toThrow();
    });
  });

  describe('listGitHubAppRepositoryBranches', () => {
    it('returns branch list with names', async () => {
      nextResponse({ data: [{ name: 'main', commit: { sha: 'abc' } }, { name: 'develop', commit: { sha: 'def' } }] });
      const manager = buildManager();
      const branches = await manager.listGitHubAppRepositoryBranches({ githubAppId: '1', repository: 'my-repo' });
      expect(branches.map((b: { name: string }) => b.name)).toEqual(['main', 'develop']);
    });

    it('returns empty when no branches', async () => {
      nextResponse({ data: [] });
      const manager = buildManager();
      const branches = await manager.listGitHubAppRepositoryBranches({ githubAppId: '1', repository: 'empty' });
      expect(branches).toHaveLength(0);
    });
  });

  // ── Applications ───────────────────────────────────────────────────────────

  describe('listApplications', () => {
    it('returns application summaries', async () => {
      nextResponse({ data: [APP] });
      const manager = buildManager();
      const apps = await manager.listApplications();
      expect(apps).toHaveLength(1);
      expect(apps[0]).toMatchObject({ applicationUuid: 'app-1', name: 'MyApp', status: 'running' });
    });

    it('returns empty array when no applications', async () => {
      nextResponse({ data: [] });
      const manager = buildManager();
      const apps = await manager.listApplications();
      expect(apps).toHaveLength(0);
    });

    it('throws on API error', async () => {
      nextErrorResponse(500);
      const manager = buildManager();
      await expect(manager.listApplications()).rejects.toThrow();
    });
  });

  describe('getApplication', () => {
    it('returns full application details', async () => {
      nextResponse({ data: APP });
      const manager = buildManager();
      const app = await manager.getApplication('app-1');
      expect(app).toMatchObject({ applicationUuid: 'app-1', name: 'MyApp', port: '3000' });
    });

    it('throws on 404', async () => {
      nextErrorResponse(404, { message: 'Not found' });
      const manager = buildManager();
      await expect(manager.getApplication('nonexistent')).rejects.toThrow();
    });

    it('throws on non-200', async () => {
      nextErrorResponse(403);
      const manager = buildManager();
      await expect(manager.getApplication('app-1')).rejects.toThrow();
    });
  });

  describe('createApplication', () => {
    it('creates application with all fields', async () => {
      nextResponse(PROJECTS);
      nextResponse(ENVIRONMENTS);
      nextResponse(SERVERS);
      nextResponse({ data: { uuid: 'new-app-1', name: 'CreatedApp', fqdn: 'created.example.com', status: 'deploying' } });
      const manager = buildManager();
      const app = await manager.createApplication({
        name: 'CreatedApp',
        githubAppUuid: 'gh-app-1',
        buildCommand: 'npm run build',
        publishDirectory: 'dist',
        branch: 'main',
        port: 8080,
        domain: 'created.example.com',
      });
      expect(app.name).toBe('CreatedApp');
      expect(app.status).toBe('deploying');
    });

    it('creates application with only required name', async () => {
      nextResponse(PROJECTS);
      nextResponse(ENVIRONMENTS);
      nextResponse(SERVERS);
      nextResponse({ data: { uuid: 'minimal-1', name: 'MinimalApp', fqdn: null, status: 'deploying' } });
      const manager = buildManager();
      const app = await manager.createApplication({ name: 'MinimalApp' });
      expect(app.applicationUuid).toBe('minimal-1');
    });

    it('uses explicit environmentUuid when provided', async () => {
      nextResponse(PROJECTS);
      nextResponse(ENVIRONMENTS);
      nextResponse(SERVERS);
      nextResponse({ data: { uuid: 'explicit-env-1', name: 'ExplicitEnv', fqdn: null, status: 'deploying' } });
      const manager = buildManager();
      const app = await manager.createApplication({ name: 'ExplicitEnv', environmentUuid: 'env-explicit' });
      expect(app.applicationUuid).toBe('explicit-env-1');
    });
  });

  describe('updateApplication', () => {
    it('updates name', async () => {
      nextResponse({ data: { ...APP, name: 'RenamedApp' } });
      const manager = buildManager();
      const app = await manager.updateApplication({ applicationUuid: 'app-1', name: 'RenamedApp' });
      expect(app.name).toBe('RenamedApp');
    });

    it('updates multiple fields', async () => {
      nextResponse({ data: { ...APP, name: 'MultiApp', build_command: 'npm run build' } });
      const manager = buildManager();
      const app = await manager.updateApplication({ applicationUuid: 'app-1', name: 'MultiApp', buildCommand: 'npm run build' });
      expect(app.name).toBe('MultiApp');
    });

    it('throws on 404', async () => {
      nextErrorResponse(404);
      const manager = buildManager();
      await expect(manager.updateApplication({ applicationUuid: 'nonexistent', name: 'X' })).rejects.toThrow();
    });
  });

  // ── Lifecycle ───────────────────────────────────────────────────────────────

  describe('startApplication', () => {
    it('starts application successfully', async () => {
      nextResponse({});
      const manager = buildManager();
      const result = await manager.startApplication('app-1');
      expect(result).toEqual({ success: true });
    });

    it('throws on failure', async () => {
      nextErrorResponse(500);
      const manager = buildManager();
      await expect(manager.startApplication('app-1')).rejects.toThrow();
    });
  });

  describe('stopApplication', () => {
    it('stops application successfully', async () => {
      nextResponse({});
      const manager = buildManager();
      const result = await manager.stopApplication('app-1');
      expect(result).toEqual({ success: true });
    });

    it('throws on failure', async () => {
      nextErrorResponse(500);
      const manager = buildManager();
      await expect(manager.stopApplication('app-1')).rejects.toThrow();
    });
  });

  describe('restartApplication', () => {
    it('restarts application successfully', async () => {
      nextResponse({});
      const manager = buildManager();
      const result = await manager.restartApplication('app-1');
      expect(result).toEqual({ success: true });
    });

    it('throws on failure', async () => {
      nextErrorResponse(500);
      const manager = buildManager();
      await expect(manager.restartApplication('app-1')).rejects.toThrow();
    });
  });

  describe('deleteApplication', () => {
    it('deletes application successfully', async () => {
      nextResponse({});
      const manager = buildManager();
      const result = await manager.deleteApplication('app-1');
      expect(result).toEqual({ success: true });
    });

    it('throws on failure', async () => {
      nextErrorResponse(500);
      const manager = buildManager();
      await expect(manager.deleteApplication('app-1')).rejects.toThrow();
    });
  });

  // ── Logs & Deployments ──────────────────────────────────────────────────────

  describe('getApplicationLogs', () => {
    it('returns logs object', async () => {
      nextResponse({ logs: 'Build started...\nBuild completed.' });
      const manager = buildManager();
      const result = await manager.getApplicationLogs({ applicationUuid: 'app-1' });
      expect(result).toMatchObject({ applicationUuid: 'app-1', logs: 'Build started...\nBuild completed.' });
    });

    it('returns empty logs when no data', async () => {
      nextResponse({});
      const manager = buildManager();
      const result = await manager.getApplicationLogs({ applicationUuid: 'app-1' });
      expect(result.logs).toBe('');
    });

    it('throws on API error', async () => {
      nextErrorResponse(500);
      const manager = buildManager();
      await expect(manager.getApplicationLogs({ applicationUuid: 'app-1' })).rejects.toThrow();
    });
  });

  describe('listApplicationDeployments', () => {
    it('returns deployment list', async () => {
      nextResponse({ data: [
        { uuid: 'dep-1', status: 'success', commit: 'abc123', branch: 'main' },
        { uuid: 'dep-2', status: 'failed', commit: 'def456', branch: 'develop' },
      ] });
      const manager = buildManager();
      const deployments = await manager.listApplicationDeployments({ applicationUuid: 'app-1' });
      expect(deployments).toHaveLength(2);
      expect(deployments[0].status).toBe('success');
      expect(deployments[1].status).toBe('failed');
    });

    it('returns empty array when no deployments', async () => {
      nextResponse({ data: [] });
      const manager = buildManager();
      const deployments = await manager.listApplicationDeployments({ applicationUuid: 'app-1' });
      expect(deployments).toHaveLength(0);
    });
  });

  describe('getDeploymentLogs', () => {
    it('returns deployment log object', async () => {
      nextResponse({ uuid: 'dep-1', status: 'success', logs: 'Deploying...\nDone.' });
      const manager = buildManager();
      const result = await manager.getDeploymentLogs({ applicationUuid: 'app-1', deploymentUuid: 'dep-1' });
      expect(result).toMatchObject({ applicationUuid: 'app-1', deploymentUuid: 'dep-1', logs: 'Deploying...\nDone.', status: 'success' });
    });

    it('returns empty logs when no data', async () => {
      nextResponse({ uuid: 'dep-1', status: 'running' });
      const manager = buildManager();
      const result = await manager.getDeploymentLogs({ applicationUuid: 'app-1', deploymentUuid: 'dep-1' });
      expect(result.logs).toBe('');
    });

    it('throws on API error', async () => {
      nextErrorResponse(500);
      const manager = buildManager();
      await expect(manager.getDeploymentLogs({ applicationUuid: 'app-1', deploymentUuid: 'dep-1' })).rejects.toThrow();
    });
  });

  // ── Environment Variables ───────────────────────────────────────────────────

  describe('listApplicationEnvs', () => {
    it('returns env list', async () => {
      nextResponse({ data: [
        { uuid: 'env-1', key: 'NODE_ENV', value: 'production', is_build_time: false, is_literal: true },
        { uuid: 'env-2', key: 'DATABASE_URL', value: 'postgres://...', is_build_time: false, is_literal: false },
      ] });
      const manager = buildManager();
      const envs = await manager.listApplicationEnvs('app-1');
      expect(envs).toHaveLength(2);
      expect(envs[0]).toMatchObject({ key: 'NODE_ENV', value: 'production' });
    });

    it('returns empty array when no envs', async () => {
      nextResponse({ data: [] });
      const manager = buildManager();
      const envs = await manager.listApplicationEnvs('app-1');
      expect(envs).toHaveLength(0);
    });

    it('throws on API error', async () => {
      nextErrorResponse(500);
      const manager = buildManager();
      await expect(manager.listApplicationEnvs('app-1')).rejects.toThrow();
    });
  });

  describe('setApplicationEnv', () => {
    it('updates existing env variable (PATCH path)', async () => {
      // 1. findApplicationEnv: env already exists
      nextResponse({ data: [{ uuid: 'env-1', key: 'NEW_VAR', value: 'old-value' }] });
      // 2. PATCH call to update env
      nextResponse({ data: [{ uuid: 'env-1', key: 'NEW_VAR', value: 'new-value' }] });
      const manager = buildManager();
      const env = await manager.setApplicationEnv({ applicationUuid: 'app-1', key: 'NEW_VAR', value: 'new-value' });
      expect(env).toMatchObject({ key: 'NEW_VAR', value: 'new-value' });
    });

    it('throws on API error', async () => {
      nextErrorResponse(500);
      const manager = buildManager();
      await expect(manager.setApplicationEnv({ applicationUuid: 'app-1', key: 'X', value: 'y' })).rejects.toThrow();
    });
  });

  describe('deleteApplicationEnv', () => {
    it('deletes env variable and returns deleted:true when removed', async () => {
      nextResponse({ data: [{ key: 'OTHER_VAR' }] });
      const manager = buildManager();
      const result = await manager.deleteApplicationEnv({ applicationUuid: 'app-1', key: 'OLD_VAR' });
      expect(result).toEqual({ deleted: true });
    });

    it('returns deleted:false when env is still present', async () => {
      nextResponse({ data: [{ key: 'OLD_VAR' }] });
      const manager = buildManager();
      const result = await manager.deleteApplicationEnv({ applicationUuid: 'app-1', key: 'OLD_VAR' });
      expect(result).toEqual({ deleted: false });
    });

    it('throws on API error', async () => {
      nextErrorResponse(500);
      const manager = buildManager();
      await expect(manager.deleteApplicationEnv({ applicationUuid: 'app-1', key: 'X' })).rejects.toThrow();
    });
  });

  // ── Domain building ──────────────────────────────────────────────────────────

  describe('buildApplicationDomain', () => {
    it('uses configured applicationsBaseDomain when available', async () => {
      // Ensure no fetch is called when applicationsBaseDomain is set
      const manager = buildManager();
      const domain = await manager.buildApplicationDomain('my-app');
      expect(domain).toBe('my-app.example.com');
      // Verify fetch was NOT called (base domain came from config, not server lookup)
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});