import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

const mockReloadAgentIfLoaded = vi.hoisted(() => vi.fn());

vi.mock('../../../../capabilities/runtime', () => ({
  reloadAgentIfLoaded: mockReloadAgentIfLoaded,
}));

import { registerConfigOps } from './config-ops';

interface MockRoute {
  method: string;
  path: string;
  handler: (req: { bodyText: string }) => Promise<{ status: number; body: string }>;
}
interface MockHttpServer {
  registerRoute: ReturnType<typeof vi.fn>;
}

function makeRequest(body: unknown): { bodyText: string } {
  return { bodyText: JSON.stringify(body) };
}

function getRouteHandler(
  httpServer: MockHttpServer,
  method: string,
  path: string,
): (req: { bodyText: string }) => Promise<{ status: number; body: string }> {
  const calls = httpServer.registerRoute.mock.calls as Array<[MockRoute]>;
  const match = calls.find((c) => c[0].method === method && c[0].path === path);
  if (!match) throw new Error(`Route ${method} ${path} not found`);
  return match[0].handler;
}

describe('registerConfigOps', () => {
  let httpServer: MockHttpServer;
  let mockDb: any;
  let mockInput: { githubApps: any; loaderConfig: any };

  beforeEach(() => {
    vi.clearAllMocks();
    mockReloadAgentIfLoaded.mockReset();
    mockReloadAgentIfLoaded.mockResolvedValue(undefined);
    httpServer = { registerRoute: vi.fn() };
    mockDb = {
      query: {
        agents: {
          findFirst: vi.fn().mockResolvedValue({ id: 'agent-456', name: 'Test Agent' }),
        },
      },
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      }),
    };
    mockInput = {
      githubApps: {
        updateAgentManifestConfig: vi.fn().mockResolvedValue({ provisioning: 'done' }),
      },
      loaderConfig: { config: 'value' },
    };
  });

  describe('POST /admin/agent/github-manifest-config/update', () => {
    it('registers the route', () => {
      registerConfigOps(httpServer as any, mockDb, mockInput);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/admin/agent/github-manifest-config/update',
        }),
      );
    });

    it('calls githubApps.updateAgentManifestConfig and returns success', async () => {
      mockInput.githubApps.updateAgentManifestConfig.mockResolvedValue({ provisioning: 'done' });
      registerConfigOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/github-manifest-config/update');

      const response = await handler(
        makeRequest({
          agentId: 'agent-123',
          manifestConfig: {
            permissions: {
              administration: true,
              contents: true,
              issues: true,
              metadata: true,
              organization_projects: true,
              pull_requests: true,
              repository_projects: true,
              workflows: true,
            },
            events: {
              push: true,
              pull_request: true,
              pull_request_review: true,
              issues: true,
              issue_comment: true,
              repository: true,
              workflow_run: true,
            },
          },
        }),
      );

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('agent-123');
      expect(mockInput.githubApps.updateAgentManifestConfig).toHaveBeenCalledWith({
        agentId: 'agent-123',
        manifestConfig: {
          permissions: {
            administration: true,
            contents: true,
            issues: true,
            metadata: true,
            organization_projects: true,
            pull_requests: true,
            repository_projects: true,
            workflows: true,
          },
          events: {
            push: true,
            pull_request: true,
            pull_request_review: true,
            issues: true,
            issue_comment: true,
            repository: true,
            workflow_run: true,
          },
        },
      });
    });

    it('returns 503 when githubApps is not configured', async () => {
      registerConfigOps(httpServer as any, mockDb, { ...mockInput, githubApps: null });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/github-manifest-config/update');

      const response = await handler(
        makeRequest({
          agentId: 'agent-123',
          manifestConfig: {
            permissions: {
              administration: true,
              contents: true,
              issues: true,
              metadata: true,
              organization_projects: true,
              pull_requests: true,
              repository_projects: true,
              workflows: true,
            },
            events: {
              push: true,
              pull_request: true,
              pull_request_review: true,
              issues: true,
              issue_comment: true,
              repository: true,
              workflow_run: true,
            },
          },
        }),
      );

      expect(response.status).toBe(503);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('GitHub Apps not configured');
    });

    it('returns 500 on manifest config error', async () => {
      mockInput.githubApps.updateAgentManifestConfig.mockRejectedValue(new Error('Manifest update failed'));
      registerConfigOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/github-manifest-config/update');

      const response = await handler(
        makeRequest({
          agentId: 'agent-123',
          manifestConfig: {
            permissions: {
              administration: true,
              contents: true,
              issues: true,
              metadata: true,
              organization_projects: true,
              pull_requests: true,
              repository_projects: true,
              workflows: true,
            },
            events: {
              push: true,
              pull_request: true,
              pull_request_review: true,
              issues: true,
              issue_comment: true,
              repository: true,
              workflow_run: true,
            },
          },
        }),
      );

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/update-config', () => {
    it('registers the route', () => {
      registerConfigOps(httpServer as any, mockDb, mockInput);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          path: '/admin/agent/update-config',
        }),
      );
    });

    it('calls reloadAgentIfLoaded with agentId after successful update', async () => {
      registerConfigOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/update-config');

      const response = await handler(makeRequest({ agentId: 'agent-456', name: 'Updated Name' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('agent-456');
      expect(mockReloadAgentIfLoaded).toHaveBeenCalled();
    });

    it('returns 404 when agent not found', async () => {
      mockDb.query.agents.findFirst.mockResolvedValue(null);
      registerConfigOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/update-config');

      const response = await handler(makeRequest({ agentId: 'nonexistent', name: 'Test' }));

      expect(response.status).toBe(404);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Agent not found');
    });

    it('returns 500 on reload error', async () => {
      mockReloadAgentIfLoaded.mockRejectedValue(new Error('Reload failed'));
      registerConfigOps(httpServer as any, mockDb, mockInput);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/update-config');

      const response = await handler(makeRequest({ agentId: 'agent-789', name: 'Updated' }));

      expect(response.status).toBe(500);
    });
  });
});