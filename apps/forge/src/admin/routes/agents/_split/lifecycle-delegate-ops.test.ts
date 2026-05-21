import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

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

function makeInput() {
  return {
    db: {},
    workspaceBasePath: '/tmp/test-workspace',
    githubApps: null,
    emailMailboxes: null,
    coolify: null,
    schedules: null,
    internalChat: null,
  };
}

// Ops parameter — typed as any to avoid Mock<Procedure|Constructable> incompatibility with vi.fn()
function makeOps(overrides?: { runInternalHiring?: unknown; runInternalTermination?: unknown; changeAgentRoleFromAdmin?: unknown }): any {
  return {
    runInternalHiring: overrides?.runInternalHiring ?? vi.fn(),
    runInternalTermination: overrides?.runInternalTermination ?? vi.fn(),
    changeAgentRoleFromAdmin: overrides?.changeAgentRoleFromAdmin ?? vi.fn(),
  };
}

describe('registerLifecycleDelegateOps', () => {
  let httpServer: MockHttpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    httpServer = { registerRoute: vi.fn() };
  });

  describe('POST /admin/agent/hire', () => {
    it('registers the route', async () => {
      const ops = makeOps();
      const { registerLifecycleDelegateOps } = await import('./lifecycle-delegate-ops');
      registerLifecycleDelegateOps(httpServer as any, makeInput(), ops);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/hire' }),
      );
    });

    it('returns 201 with hire result', async () => {
      const mockHiring = vi.fn().mockResolvedValue({ agentId: 'new-agent-1', name: 'Hired Agent' });
      const ops = makeOps({ runInternalHiring: mockHiring });
      const { registerLifecycleDelegateOps } = await import('./lifecycle-delegate-ops');
      registerLifecycleDelegateOps(httpServer as any, makeInput(), ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/hire');

      const response = await handler(
        makeRequest({
          hiringRequest: 'Hire a developer agent',
          additionalContext: 'Use TypeScript',
          weeklyBudgetUsd: 500,
        }),
      );

      expect(response.status).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.agentId).toBe('new-agent-1');
      expect(mockHiring).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          hiringRequest: 'Hire a developer agent',
          additionalContext: 'Use TypeScript',
          weeklyBudgetUsd: 500,
          workspaceBasePath: '/tmp/test-workspace',
        }),
      );
    });

    it('works without optional additionalContext', async () => {
      const mockHiring = vi.fn().mockResolvedValue({ agentId: 'new-agent-2' });
      const ops = makeOps({ runInternalHiring: mockHiring });
      const { registerLifecycleDelegateOps } = await import('./lifecycle-delegate-ops');
      registerLifecycleDelegateOps(httpServer as any, makeInput(), ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/hire');

      const response = await handler(
        makeRequest({ hiringRequest: 'Hire a tester', weeklyBudgetUsd: 300 }),
      );

      expect(response.status).toBe(201);
    });

    it('returns 500 on hiring error', async () => {
      const mockHiring = vi.fn().mockRejectedValue(new Error('Hiring failed'));
      const ops = makeOps({ runInternalHiring: mockHiring });
      const { registerLifecycleDelegateOps } = await import('./lifecycle-delegate-ops');
      registerLifecycleDelegateOps(httpServer as any, makeInput(), ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/hire');

      const response = await handler(
        makeRequest({ hiringRequest: 'Hire someone', weeklyBudgetUsd: 200 }),
      );

      expect(response.status).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });

  describe('POST /admin/agent/terminate', () => {
    it('registers the route', async () => {
      const ops = makeOps();
      const { registerLifecycleDelegateOps } = await import('./lifecycle-delegate-ops');
      registerLifecycleDelegateOps(httpServer as any, makeInput(), ops);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/terminate' }),
      );
    });

    it('returns result from runInternalTermination', async () => {
      const mockTerm = vi.fn().mockResolvedValue({ success: true, terminatedAt: Date.now() });
      const ops = makeOps({ runInternalTermination: mockTerm });
      const { registerLifecycleDelegateOps } = await import('./lifecycle-delegate-ops');
      registerLifecycleDelegateOps(httpServer as any, makeInput(), ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/terminate');

      const response = await handler(makeRequest({ agentId: 'agent-to-terminate' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(mockTerm).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          agentId: 'agent-to-terminate',
          workspaceBasePath: '/tmp/test-workspace',
        }),
      );
    });

    it('returns 500 on termination error', async () => {
      const mockTerm = vi.fn().mockRejectedValue(new Error('Termination failed'));
      const ops = makeOps({ runInternalTermination: mockTerm });
      const { registerLifecycleDelegateOps } = await import('./lifecycle-delegate-ops');
      registerLifecycleDelegateOps(httpServer as any, makeInput(), ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/terminate');

      const response = await handler(makeRequest({ agentId: 'agent-123' }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/change-role', () => {
    it('registers the route', async () => {
      const ops = makeOps();
      const { registerLifecycleDelegateOps } = await import('./lifecycle-delegate-ops');
      registerLifecycleDelegateOps(httpServer as any, makeInput(), ops);
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/change-role' }),
      );
    });

    it('returns success after changeAgentRoleFromAdmin', async () => {
      const mockRole = vi.fn().mockResolvedValue(undefined);
      const ops = makeOps({ changeAgentRoleFromAdmin: mockRole });
      const { registerLifecycleDelegateOps } = await import('./lifecycle-delegate-ops');
      registerLifecycleDelegateOps(httpServer as any, makeInput(), ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/change-role');

      const response = await handler(makeRequest({ agentId: 'agent-456', roleId: 'role-admin' }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(mockRole).toHaveBeenCalledWith(
        expect.anything(),
        { agentId: 'agent-456', roleId: 'role-admin' },
      );
    });

    it('returns 500 on role change error', async () => {
      const mockRole = vi.fn().mockRejectedValue(new Error('Role change failed'));
      const ops = makeOps({ changeAgentRoleFromAdmin: mockRole });
      const { registerLifecycleDelegateOps } = await import('./lifecycle-delegate-ops');
      registerLifecycleDelegateOps(httpServer as any, makeInput(), ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/change-role');

      const response = await handler(makeRequest({ agentId: 'agent-456', roleId: 'role-admin' }));

      expect(response.status).toBe(500);
    });
  });
});