import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { registerLifecycleDelegateOps } from './lifecycle-delegate-ops';

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

describe('registerLifecycleDelegateOps', () => {
  let httpServer: MockHttpServer;
  let mockInput: any;
  let mockOps: {
    runInternalHiring: ReturnType<typeof vi.fn>;
    runInternalTermination: ReturnType<typeof vi.fn>;
    changeAgentRoleFromAdmin: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    httpServer = { registerRoute: vi.fn() };
    mockInput = {
      db: {},
      workspaceBasePath: '/agents/workspaces',
      githubApps: {},
      emailMailboxes: {},
      coolify: {},
      schedules: {},
      internalChat: {},
    };
    mockOps = {
      runInternalHiring: vi.fn().mockResolvedValue({ success: true, agentId: 'new-agent-id' }),
      runInternalTermination: vi.fn().mockResolvedValue({ success: true, terminated: true }),
      changeAgentRoleFromAdmin: vi.fn().mockResolvedValue(undefined),
    };
  });

  describe('POST /admin/agent/hire', () => {
    it('registers the route', () => {
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/hire' }),
      );
    });

    it('calls runInternalHiring with hiring request and returns 201', async () => {
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/hire');

      const response = await handler(
        makeRequest({
          hiringRequest: 'Build a React dashboard',
          additionalContext: 'Use TailwindCSS',
          weeklyBudgetUsd: 500,
        }),
      );

      expect(response.status).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.agentId).toBe('new-agent-id');
      expect(mockOps.runInternalHiring).toHaveBeenCalledWith(
        {},
        expect.objectContaining({
          hiringRequest: 'Build a React dashboard',
          additionalContext: 'Use TailwindCSS',
          weeklyBudgetUsd: 500,
          workspaceBasePath: '/agents/workspaces',
        }),
      );
    });

    it('calls runInternalHiring with minimal input (no additionalContext)', async () => {
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/hire');

      const response = await handler(
        makeRequest({ hiringRequest: 'Simple task', weeklyBudgetUsd: 100 }),
      );

      expect(response.status).toBe(201);
      expect(mockOps.runInternalHiring).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ hiringRequest: 'Simple task', weeklyBudgetUsd: 100 }),
      );
    });

    it('returns 500 on hire error', async () => {
      mockOps.runInternalHiring.mockRejectedValue(new Error('Hiring failed: no budget'));
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/hire');

      const response = await handler(
        makeRequest({ hiringRequest: 'Big task', weeklyBudgetUsd: 10000 }),
      );

      expect(response.status).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Hiring failed');
    });

    it('returns 500 on missing weeklyBudgetUsd', async () => {
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/hire');

      const response = await handler(makeRequest({ hiringRequest: 'Missing budget' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/terminate', () => {
    it('registers the route', () => {
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/terminate' }),
      );
    });

    it('calls runInternalTermination with agentId and returns result', async () => {
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/terminate');

      const response = await handler(makeRequest({ agentId: 'agent-terminate-1' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.terminated).toBe(true);
      expect(mockOps.runInternalTermination).toHaveBeenCalledWith(
        {},
        expect.objectContaining({ agentId: 'agent-terminate-1', workspaceBasePath: '/agents/workspaces' }),
      );
    });

    it('returns 500 on terminate error', async () => {
      mockOps.runInternalTermination.mockRejectedValue(new Error('Agent not found'));
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/terminate');

      const response = await handler(makeRequest({ agentId: 'nonexistent' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/change-role', () => {
    it('registers the route', () => {
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/change-role' }),
      );
    });

    it('calls changeAgentRoleFromAdmin and returns success', async () => {
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/change-role');

      const response = await handler(makeRequest({ agentId: 'agent-role-1', roleId: 'role-senior' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(mockOps.changeAgentRoleFromAdmin).toHaveBeenCalledWith({}, { agentId: 'agent-role-1', roleId: 'role-senior' });
    });

    it('returns 500 on change-role error', async () => {
      mockOps.changeAgentRoleFromAdmin.mockRejectedValue(new Error('Role not found'));
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/change-role');

      const response = await handler(makeRequest({ agentId: 'agent-bad', roleId: 'role-404' }));

      expect(response.status).toBe(500);
    });

    it('returns 500 on missing agentId', async () => {
      registerLifecycleDelegateOps(httpServer as any, mockInput, mockOps);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/change-role');

      const response = await handler(makeRequest({ roleId: 'role-senior' }));

      expect(response.status).toBe(500);
    });
  });
});