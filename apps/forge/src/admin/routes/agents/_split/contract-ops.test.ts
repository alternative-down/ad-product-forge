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

describe('registerContractOps', () => {
  let httpServer: MockHttpServer;

  beforeEach(() => {
    vi.clearAllMocks();
    httpServer = { registerRoute: vi.fn() };
  });

  describe('POST /admin/agent/contract/top-up', () => {
    it('registers the route', async () => {
      const topUp = vi.fn();
      const adjust = vi.fn();
      const renew = vi.fn();
      const { registerContractOps } = await import('./contract-ops');
      registerContractOps({
        httpServer: httpServer as any,
        db: {},
        ops: { topUpActiveAgentContract: topUp, adjustAgentContractBudget: adjust, renewAgentContract: renew },
      });
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/contract/top-up' }),
      );
    });

    it('calls ops.topUpActiveAgentContract and returns result', async () => {
      const topUp = vi.fn().mockResolvedValue({ success: true, newBalance: 100 });
      const adjust = vi.fn();
      const renew = vi.fn();
      const { registerContractOps } = await import('./contract-ops');
      registerContractOps({
        httpServer: httpServer as any,
        db: {},
        ops: { topUpActiveAgentContract: topUp, adjustAgentContractBudget: adjust, renewAgentContract: renew },
      });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/top-up');
      const response = await handler(makeRequest({ agentId: 'agent-123', amountUsd: 50 }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(topUp).toHaveBeenCalled();
    });

    it('returns 500 on ops error', async () => {
      const topUp = vi.fn().mockRejectedValue(new Error('Top-up failed'));
      const adjust = vi.fn();
      const renew = vi.fn();
      const { registerContractOps } = await import('./contract-ops');
      registerContractOps({
        httpServer: httpServer as any,
        db: {},
        ops: { topUpActiveAgentContract: topUp, adjustAgentContractBudget: adjust, renewAgentContract: renew },
      });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/top-up');
      const response = await handler(makeRequest({ agentId: 'agent-123', amountUsd: 50 }));

      expect(response.status).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toBeDefined();
    });
  });

  describe('POST /admin/agent/contract/adjust-budget', () => {
    it('registers the route', async () => {
      const topUp = vi.fn();
      const adjust = vi.fn();
      const renew = vi.fn();
      const { registerContractOps } = await import('./contract-ops');
      registerContractOps({
        httpServer: httpServer as any,
        db: {},
        ops: { topUpActiveAgentContract: topUp, adjustAgentContractBudget: adjust, renewAgentContract: renew },
      });
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/contract/adjust-budget' }),
      );
    });

    it('calls ops.adjustAgentContractBudget and returns result', async () => {
      const adjust = vi.fn().mockResolvedValue({ success: true, adjustedBudget: 200 });
      const topUp = vi.fn();
      const renew = vi.fn();
      const { registerContractOps } = await import('./contract-ops');
      registerContractOps({
        httpServer: httpServer as any,
        db: {},
        ops: { topUpActiveAgentContract: topUp, adjustAgentContractBudget: adjust, renewAgentContract: renew },
      });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/adjust-budget');
      const response = await handler(makeRequest({ agentId: 'agent-456', newBudgetUsd: 200 }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(adjust).toHaveBeenCalled();
    });

    it('returns 500 on ops error', async () => {
      const adjust = vi.fn().mockRejectedValue(new Error('Adjust budget failed'));
      const topUp = vi.fn();
      const renew = vi.fn();
      const { registerContractOps } = await import('./contract-ops');
      registerContractOps({
        httpServer: httpServer as any,
        db: {},
        ops: { topUpActiveAgentContract: topUp, adjustAgentContractBudget: adjust, renewAgentContract: renew },
      });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/adjust-budget');
      const response = await handler(makeRequest({ agentId: 'agent-456', newBudgetUsd: 200 }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/contract/renew', () => {
    it('registers the route', async () => {
      const topUp = vi.fn();
      const adjust = vi.fn();
      const renew = vi.fn();
      const { registerContractOps } = await import('./contract-ops');
      registerContractOps({
        httpServer: httpServer as any,
        db: {},
        ops: { topUpActiveAgentContract: topUp, adjustAgentContractBudget: adjust, renewAgentContract: renew },
      });
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/contract/renew' }),
      );
    });

    it('calls ops.renewAgentContract and returns result', async () => {
      const renew = vi.fn().mockResolvedValue({ success: true, expiresAt: Date.now() + 86400000 });
      const topUp = vi.fn();
      const adjust = vi.fn();
      const { registerContractOps } = await import('./contract-ops');
      registerContractOps({
        httpServer: httpServer as any,
        db: {},
        ops: { topUpActiveAgentContract: topUp, adjustAgentContractBudget: adjust, renewAgentContract: renew },
      });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/renew');
      const response = await handler(makeRequest({ agentId: 'agent-789', newBudgetUsd: 100 }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(renew).toHaveBeenCalled();
    });

    it('returns 500 on ops error', async () => {
      const renew = vi.fn().mockRejectedValue(new Error('Renew failed'));
      const topUp = vi.fn();
      const adjust = vi.fn();
      const { registerContractOps } = await import('./contract-ops');
      registerContractOps({
        httpServer: httpServer as any,
        db: {},
        ops: { topUpActiveAgentContract: topUp, adjustAgentContractBudget: adjust, renewAgentContract: renew },
      });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/renew');
      const response = await handler(makeRequest({ agentId: 'agent-789', newBudgetUsd: 100 }));

      expect(response.status).toBe(500);
    });
  });
});