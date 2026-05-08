/**
 * Integration tests for CoolifyManager methods.
 * Tests all async functions returned by createCoolifyManager.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCoolifyManager } from './manager';

// ─── Mock integrations factory ───────────────────────────────────────────────

function createMockIntegrations(getCoolifyConfigResult?: unknown, err?: Error) {
  return {
    getCoolifyConfig: vi.fn().mockImplementation(async () => {
      if (err) throw err;
      return getCoolifyConfigResult;
    }),
  };
}

const MOCK_PROVIDER_CONFIG = {
  baseUrl: 'https://coolify.example.com',
  adminToken: 'test-token',
  serverId: 'server-001',
  destinationId: 'dest-001',
  applicationsBaseDomain: 'app.example.com',
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('CoolifyManager', () => {
  let responses: Record<string, { status: number; body?: unknown }>;
  let mockFetch: ReturnType<typeof vi.fn>;
  let integrations: ReturnType<typeof createMockIntegrations>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let manager: any;
  let mockForgeDebug: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    responses = {
      'GET /github-apps': { status: 200, body: { github_apps: [] } },
      'POST /github-apps': { status: 201, body: { data: { id: 1, uuid: 'ga_001', name: 'Test App' } } },
      'GET /github-apps/1/repositories': { status: 200, body: { repositories: [] } },
      'GET /github-apps/1/repositories/my-repo/branches': { status: 200, body: { branches: [] } },
      'GET /github-apps/1/repositories/repo/branches': { status: 200, body: { branches: [] } },
      'GET /applications': { status: 200, body: { applications: [] } },
      'GET /applications/app-001': { status: 200, body: { application: { uuid: 'app-001', name: 'Test App', fqdn: 'https://test.example.com', status: 'running', repository: 'org/repo', git_branch: 'main' } } },
      'POST /applications': { status: 201, body: { application: { uuid: 'app-new', name: 'New App' } } },
      'PATCH /applications/app-001': { status: 200, body: { application: { uuid: 'app-001', name: 'Updated App' } } },
      'GET /applications/app-001/start': { status: 200, body: {} },
      'GET /applications/app-001/stop': { status: 200, body: {} },
      'GET /applications/app-001/restart': { status: 200, body: {} },
      'DELETE /applications/app-001': { status: 204, body: undefined },
      'GET /applications/app-001/logs': { status: 200, body: { logs: 'Build log output' } },
      'GET /applications/app-001/deployments': { status: 200, body: { deployments: [{ uuid: 'dep-001', deployment_uuid: 'dep-001', status: 'running' }] } },
      'GET /deployments/dep-001': { status: 200, body: { deployment: { uuid: 'dep-001', status: 'completed' } } },
      'GET /applications/app-001/envs': { status: 200, body: { envs: [] } },
      'GET /servers/server-001': { status: 200, body: { server: { uuid: 'server-001', wildcard_domain: 'wildcard.example.com' } } },
    };

    mockFetch = vi.fn().mockImplementation((url: string, options?: { method?: string; body?: string }) => {
      const baseUrl = 'https://coolify.example.com/api/v1';
      const path = url.startsWith(baseUrl) ? url.slice(baseUrl.length) : url;
      const key = `${options?.method ?? 'GET'} ${path}`;
      console.log('[DEBUG] key:', key, '| in responses:', key in responses); const hasKey = key in responses;
      const response = hasKey ? responses[key] : { status: 200, body: {} };
      const text = response.body != null ? JSON.stringify(response.body) : '';
      return Promise.resolve({
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        text: () => Promise.resolve(text),
      });
    });

    vi.stubGlobal('fetch', mockFetch);
    integrations = createMockIntegrations(MOCK_PROVIDER_CONFIG);
    manager = createCoolifyManager({ integrations });
    mockForgeDebug = vi.fn();
    vi.stubGlobal('forgeDebug', mockForgeDebug);
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  describe('getCredentials', () => {
    it('returns credentials from provider config', async () => {
      const creds = await manager.getCredentials();
      expect(creds.baseUrl).toBe('https://coolify.example.com/api/v1');
      expect(creds.apiToken).toBe('test-token');
      expect(creds.serverId).toBe('server-001');
      expect(creds.destinationId).toBe('dest-001');
      expect(creds.applicationsBaseDomain).toBe('app.example.com');
    });

    it('throws when integration not configured', async () => {
      const badIntegrations = createMockIntegrations(undefined, new Error('no integration'));
      const badManager = createCoolifyManager({ integrations: badIntegrations });
      await expect(badManager.getCredentials()).rejects.toThrow('no integration');
    });
  });

  describe('listGitHubApps', () => {
    it('maps github_apps to typed output', async () => {
      responses['GET /github-apps'] = {
        status: 200,
        body: {
          github_apps: [
            { id: 1, uuid: 'ga-001', name: 'App One', organization: 'org-a', api_url: 'https://api.github.com', html_url: 'https://github.com/apps/a' },
          ],
        },
      };

      const apps = await manager.listGitHubApps();

      expect(apps).toHaveLength(1);
      expect(apps[0]).toMatchObject({
        githubAppId: 1,
        githubAppUuid: 'ga-001',
        name: 'App One',
        organization: 'org-a',
        apiUrl: 'https://api.github.com',
        htmlUrl: 'https://github.com/apps/a',
      });
    });

    it('returns empty array when no github_apps key', async () => {
      responses['GET /github-apps'] = { status: 200, body: {} };
      const apps = await manager.listGitHubApps();
      expect(apps).toEqual([]);
    });

    it('treats missing optional fields as null', async () => {
      responses['GET /github-apps'] = { status: 200, body: { github_apps: [{ id: 5, uuid: 'ga-005' }] } };
      const apps = await manager.listGitHubApps();
      expect(apps[0]).toMatchObject({ name: null, organization: null, apiUrl: null, htmlUrl: null });
    });
  });

  describe('createGitHubApp', () => {
    it('posts correct payload to API', async () => {
      await manager.createGitHubApp({ name: 'Test', organization: 'org', appId: '1', installationId: '2', webhookSecret: 'w' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/github-apps'),
        expect.objectContaining({ method: 'POST', body: expect.any(String) }),
      );
      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body as string);
      expect(body.name).toBe('Test');
      expect(body.organization).toBe('org');
      expect(body.app_id).toBe('1');
      expect(body.installation_id).toBe('2');
      expect(body.webhook_secret).toBe('w');
    });

    it('returns mapped result with githubAppUuid', async () => {
      responses['POST /github-apps'] = { status: 201, body: { uuid: 'ga_001' } };
      const result = await manager.createGitHubApp({ name: 'Test', organization: 'org', appId: '1', installationId: '2', webhookSecret: 'w' });
      expect(result).toHaveProperty('githubAppUuid');
    });
  });

  describe('listGitHubAppRepositories', () => {
    it('maps repositories to typed output', async () => {
      responses['GET /github-apps/1/repositories'] = {
        status: 200,
        body: {
          repositories: [
            { id: 101, uuid: 'repo-001', name: 'frontend', full_name: 'org/frontend', private: true },
            { id: 102, uuid: 'repo-002', name: 'backend', full_name: 'org/backend', private: false },
          ],
        },
      };

      const repos = await manager.listGitHubAppRepositories({ githubAppId: 1 });

      expect(repos).toHaveLength(2);
      expect(repos[0]).toMatchObject({ name: 'frontend' });
      expect(repos[1]).toMatchObject({ name: 'backend' });
    });

    it('accepts string githubAppId', async () => {
      responses['GET /github-apps/ga-001/repositories'] = { status: 200, body: { repositories: [] } };

      await manager.listGitHubAppRepositories({ githubAppId: 'ga-001' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/github-apps/ga-001/'), expect.any(Object));
    });

    it('returns empty array when no repositories', async () => {
      responses['GET /github-apps/1/repositories'] = { status: 200, body: {} };
      const repos = await manager.listGitHubAppRepositories({ githubAppId: 1 });
      expect(repos).toEqual([]);
    });
  });

  describe('listGitHubAppRepositoryBranches', () => {
    it('maps branches to typed output', async () => {
      responses['GET /github-apps/1/repositories/repo/branches'] = {
        status: 200,
        body: {
          branches: [
            { name: 'main', commit_sha: 'abc123', protected: true },
            { name: 'develop', commit_sha: 'def456', protected: false },
          ],
        },
      };

      const branches = await manager.listGitHubAppRepositoryBranches({ githubAppId: 1, repository: 'repo' });

      expect(branches).toHaveLength(2);
      expect(branches[0]).toMatchObject({ name: 'main' });
      expect(branches[1]).toMatchObject({ name: 'develop' });
    });

    it('returns empty array when no branches', async () => {
      responses['GET /github-apps/1/repositories/repo/branches'] = { status: 200, body: {} };
      const branches = await manager.listGitHubAppRepositoryBranches({ githubAppId: 1, repository: 'repo' });
      expect(branches).toEqual([]);
    });
  });

  describe('listApplications', () => {
    it('returns applications array', async () => {
      responses['GET /applications'] = {
        status: 200,
        body: {
          applications: [
            { uuid: 'a1', name: 'App One', fqdn: 'https://one.com', status: 'running', repository: 'o/r', git_branch: 'main' },
            { uuid: 'a2', name: 'App Two', fqdn: 'https://two.com', status: 'idle', repository: 'o/r2', git_branch: 'develop' },
          ],
        },
      };

      const apps = await manager.listApplications();

      expect(apps).toHaveLength(2);
      expect(apps[0]).toMatchObject({ applicationUuid: 'a1', name: 'App One', status: 'running', repository: 'o/r', branch: 'main' });
      expect(apps[1]).toMatchObject({ applicationUuid: 'a2', name: 'App Two', fqdn: 'https://two.com', repository: 'o/r2', branch: 'develop' });
    });
  });

  describe('getApplication', () => {
    it('returns single application', async () => {
      const result = await manager.getApplication('app-001');
      expect(result).toMatchObject({ applicationUuid: 'app-001', name: 'Test App', fqdn: 'https://test.example.com', status: 'running' });
    });

    it('throws on API error', async () => {
      responses['GET /applications/nonexistent'] = { status: 404, body: { message: 'Not found' } };
      await expect(manager.getApplication('nonexistent')).rejects.toThrow('404');
    });
  });

  describe('updateApplication', () => {
    it('patches application with body fields', async () => {
      await manager.updateApplication({ applicationUuid: 'app-001', name: 'Renamed', buildCommand: 'npm run build', port: 3000 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/applications/app-001'),
        expect.objectContaining({ method: 'PATCH', body: expect.any(String) }),
      );
      const [, opts] = mockFetch.mock.calls[0];
      const body = JSON.parse(opts.body as string);
      expect(body.name).toBe('Renamed');
      expect(body.build_command).toBe('npm run build');
      expect(body.port).toBe(3000);
    });
  });

  describe('startApplication', () => {
    it('calls the start endpoint', async () => {
      await manager.startApplication('app-001');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/applications/app-001/start'), expect.any(Object));
    });
  });

  describe('stopApplication', () => {
    it('calls the stop endpoint', async () => {
      await manager.stopApplication('app-001');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/applications/app-001/stop'), expect.any(Object));
    });
  });

  describe('restartApplication', () => {
    it('calls the restart endpoint', async () => {
      await manager.restartApplication('app-001');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/applications/app-001/restart'), expect.any(Object));
    });
  });

  describe('deleteApplication', () => {
    it('deletes and returns success', async () => {
      const result = await manager.deleteApplication('app-001');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/applications/app-001'), expect.objectContaining({ method: 'DELETE', body: undefined }));
      expect(result).toEqual({ success: true });
    });

    it('throws on API error', async () => {
      responses['DELETE /applications/app-001'] = { status: 403, body: 'Forbidden' };
      await expect(manager.deleteApplication('app-001')).rejects.toThrow('403');
    });
  });

  describe('getApplicationLogs', () => {
    it('returns applicationUuid and logs from response', async () => {
      const result = await manager.getApplicationLogs({ applicationUuid: 'app-001' });
      expect(result).toMatchObject({ applicationUuid: 'app-001', logs: 'Build log output' });
    });

    it('encodes uuid in URL', async () => {
      responses['GET /applications/app-test/logs'] = { status: 200, body: { logs: 'x' } };
      await manager.getApplicationLogs({ applicationUuid: 'app-test' });
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('applications/app-test/logs'), expect.any(Object));
    });

    it('passes lines param to API', async () => {
      responses['GET /applications/app-001/logs?lines=100'] = { status: 200, body: { logs: 'x' } };
      await manager.getApplicationLogs({ applicationUuid: 'app-001', lines: 100 });
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('lines=100'), expect.any(Object));
    });

    it('passes since param to API', async () => {
      responses['GET /applications/app-001/logs?since=1234567890'] = { status: 200, body: { logs: 'x' } };
      await manager.getApplicationLogs({ applicationUuid: 'app-001', since: 1234567890 });
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('since=1234567890'), expect.any(Object));
    });
  });

  describe('listApplicationDeployments', () => {
    it('returns deployments array', async () => {
      responses['GET /deployments?application_uuid=app-001'] = {
        status: 200,
        body: { deployments: [{ uuid: 'd1', deployment_uuid: 'd1', status: 'running', commit: 'abc123' }] },
      };

      const deployments = await manager.listApplicationDeployments({ applicationUuid: 'app-001' });

      expect(deployments).toHaveLength(1);
      expect(deployments[0]).toMatchObject({ deploymentUuid: 'd1', status: 'running' });
    });

    it('passes limit to API', async () => {
      responses['GET /deployments?application_uuid=app-001&per_page=5'] = { status: 200, body: { deployments: [] } };
      await manager.listApplicationDeployments({ applicationUuid: 'app-001', limit: 5 });
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('per_page=5'), expect.any(Object));
    });
  });

  describe('getDeploymentLogs', () => {
    it('returns deployment with logs', async () => {
      responses['GET /deployments?application_uuid=app-001'] = {
        status: 200,
        body: { deployments: [{ uuid: 'dep-001', deployment_uuid: 'dep-001', status: 'running', created_at: '2024-01-01T00:00:00Z' }] },
      };
      responses['GET /deployments/dep-001'] = {
        status: 200,
        body: { deployment: { uuid: 'dep-001', status: 'completed', logs: 'Done' } },
      };

      // Add debug: log all fetch calls made
      const result = await manager.getDeploymentLogs({ applicationUuid: 'app-001', deploymentUuid: 'dep-001' });
      expect(result).toMatchObject({ deploymentUuid: 'dep-001', status: 'completed' });
    });
  });

  describe('listApplicationEnvs', () => {
    it('returns env vars array', async () => {
      responses['GET /applications/app-001/envs'] = {
        status: 200,
        body: {
          envs: [
            { key: 'FOO', value: 'bar', uuid: 'e1', is_preview: false, is_build_time: false, is_literal: false, is_multiline: false, is_shown_once: false },
          ],
        },
      };

      const envs = await manager.listApplicationEnvs('app-001');

      expect(envs).toHaveLength(1);
      expect(envs[0]).toMatchObject({ key: 'FOO', value: 'bar' });
    });

    it('maps preview and literal flags', async () => {
      responses['GET /applications/app-001/envs'] = {
        status: 200,
        body: {
          envs: [
            { key: 'PREVIEW_URL', value: 'https://preview.io', uuid: 'e2', is_preview: true, is_build_time: true, is_literal: true, is_multiline: true, is_shown_once: true },
          ],
        },
      };

      const envs = await manager.listApplicationEnvs('app-001');

      expect(envs[0]).toMatchObject({ isPreview: true, isBuildTime: true, isLiteral: true, isMultiline: true, isShownOnce: true });
    });
  });

  describe('setApplicationEnv', () => {
    it('creates new env when not found', async () => {
      responses['GET /applications/app-001/envs'] = { status: 200, body: { envs: [] } };
      responses['POST /applications/app-001/envs'] = {
        status: 201,
        body: { env: { key: 'NEW', value: 'val', uuid: 'env-new', is_preview: false, is_build_time: false, is_literal: false, is_multiline: false, is_shown_once: false } },
      };

      const result = await manager.setApplicationEnv({ applicationUuid: 'app-001', key: 'NEW', value: 'val' });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/applications/app-001/envs'), expect.objectContaining({ method: 'POST' }));
      expect(result).toMatchObject({ key: 'NEW', value: 'val', envId: 'env-new' });
    });

    it('patches existing env via bulk endpoint', async () => {
      responses['GET /applications/app-001/envs'] = {
        status: 200,
        body: { envs: [{ key: 'FOO', value: 'old', uuid: 'env-001', is_preview: false, is_build_time: false, is_literal: false, is_multiline: false, is_shown_once: false }] },
      };
      responses['PATCH /applications/app-001/envs/bulk'] = {
        status: 200,
        body: { data: [{ key: 'FOO', value: 'updated', uuid: 'env-001', is_preview: true, is_build_time: false, is_literal: false, is_multiline: false, is_shown_once: false }] },
      };

      const result = await manager.setApplicationEnv({ applicationUuid: 'app-001', key: 'FOO', value: 'updated', isPreview: true });

      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/envs/bulk'), expect.objectContaining({ method: 'PATCH' }));
      expect(result).toMatchObject({ key: 'FOO', value: 'updated', isPreview: true });
    });

    it('throws when bulk update does not return the env', async () => {
      responses['GET /applications/app-001/envs'] = {
        status: 200,
        body: { envs: [{ key: 'FOO', value: 'old', uuid: 'env-001', is_preview: false, is_build_time: false, is_literal: false, is_multiline: false, is_shown_once: false }] },
      };
      responses['PATCH /applications/app-001/envs/bulk'] = { status: 200, body: { data: [] } };

      await expect(manager.setApplicationEnv({ applicationUuid: 'app-001', key: 'FOO', value: 'updated' })).rejects.toThrow('did not return env FOO');
    });
  });

  describe('deleteApplicationEnv', () => {
    it('calls POST /envs/delete and returns deleted flag', async () => {
      responses['POST /applications/app-001/envs/delete'] = {
        status: 200,
        body: { envs: [{ key: 'FOO', value: 'bar', uuid: 'env-001', is_preview: false, is_build_time: false, is_literal: false, is_multiline: false, is_shown_once: false }] },
      };

      const result = await manager.deleteApplicationEnv({ applicationUuid: 'app-001', key: 'FOO' });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/applications/app-001/envs/delete'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(result).toMatchObject({ deleted: false });
    });

    it('returns deleted true when env not in response', async () => {
      responses['POST /applications/app-001/envs/delete'] = {
        status: 200,
        body: { envs: [] },
      };

      const result = await manager.deleteApplicationEnv({ applicationUuid: 'app-001', key: 'NONEXISTENT' });

      expect(result).toMatchObject({ deleted: true });
    });
  });

    // ── New coverage tests (forgeDebug fix) ───────────────────────────────

    it('createGitHubApp maps githubAppUuid from API response', async () => {
      responses['POST /github-apps'] = {
        status: 201,
        body: { uuid: 'ga_new_001' },
      };

      const result = await manager.createGitHubApp({
        name: 'My Forge App',
        organization: 'my-org',
        appId: '1',
        installationId: '2',
        webhookSecret: 'secret',
      });

      expect(result.githubAppUuid).toBe('ga_new_001');
      const lastCall = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
      const [, opts] = lastCall;
      const body = JSON.parse(opts.body);
      expect(body.name).toBe('My Forge App');
    });

    it('listGitHubAppRepositoryBranches returns branch names', async () => {
      responses['GET /github-apps/1/repositories/repo/branches'] = {
        status: 200,
        body: {
          branches: [
            { name: 'main', commit: { sha: 'abc123', created_at: '2025-01-01' } },
            { name: 'develop', commit: { sha: 'def456', created_at: '2025-01-02' } },
          ],
        },
      };

      const result = await manager.listGitHubAppRepositoryBranches({
        githubAppId: 1,
        repository: 'repo',
      });

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('main');
      expect(result[1].name).toBe('develop');
    });

    it('restartApplication calls the restart endpoint', async () => {
      const result = await manager.restartApplication('app-001');
      expect(result).toEqual({ success: true });
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/applications/app-001/restart'),
        expect.any(Object),
      );
    });

});