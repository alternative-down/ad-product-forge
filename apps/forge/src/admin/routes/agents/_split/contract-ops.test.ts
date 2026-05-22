import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));

import { registerContractOps } from './contract-ops';

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
  let mockDb: any;
  let mockOps: {
    topUpActiveAgentContract: ReturnType<typeof vi.fn>;
    adjustAgentContractBudget: ReturnType<typeof vi.fn>;
    renewAgentContract: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    httpServer = { registerRoute: vi.fn() };
    mockDb = {};
    mockOps = {
      topUpActiveAgentContract: vi.fn().mockResolvedValue({ success: true, newBalance: 100 }),
      adjustAgentContractBudget: vi.fn().mockResolvedValue({ success: true, budget: 500 }),
      renewAgentContract: vi.fn().mockResolvedValue({ success: true, expiresAt: 9999999999 }),
    };
  });

  describe('POST /admin/agent/contract/top-up', () => {
    it('registers the route', () => {
      registerContractOps({ httpServer: httpServer as any, db: mockDb, ops: mockOps as any });
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/contract/top-up' }),
      );
    });

    it('calls topUpActiveAgentContract and returns 200', async () => {
      registerContractOps({ httpServer: httpServer as any, db: mockDb, ops: mockOps as any });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/top-up');

      const response = await handler(makeRequest({ agentId: 'contract-agent-1', amountUsd: 50 }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.newBalance).toBe(100);
      expect(mockOps.topUpActiveAgentContract).toHaveBeenCalledWith(mockDb, { agentId: 'contract-agent-1', amountUsd: 50 });
    });

    it('returns 500 on top-up error', async () => {
      mockOps.topUpActiveAgentContract.mockRejectedValue(new Error('Top-up failed'));
      registerContractOps({ httpServer: httpServer as any, db: mockDb, ops: mockOps as any });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/top-up');

      const response = await handler(makeRequest({ agentId: 'contract-agent-1', amountUsd: 50 }));

      expect(response.status).toBe(500);
      const body = JSON.parse(response.body);
      expect(body.error).toContain('Top-up failed');
    });

    it('returns 500 on invalid schema (negative amount)', async () => {
      registerContractOps({ httpServer: httpServer as any, db: mockDb, ops: mockOps as any });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/top-up');

      const response = await handler(makeRequest({ agentId: 'contract-agent-1', amountUsd: -10 }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/contract/adjust-budget', () => {
    it('registers the route', () => {
      registerContractOps({ httpServer: httpServer as any, db: mockDb, ops: mockOps as any });
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/contract/adjust-budget' }),
      );
    });

    it('calls adjustAgentContractBudget and returns 200', async () => {
      registerContractOps({ httpServer: httpServer as any, db: mockDb, ops: mockOps as any });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/adjust-budget');

      const response = await handler(makeRequest({ agentId: 'contract-agent-2', newBudgetUsd: 200 }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.budget).toBe(500);
      expect(mockOps.adjustAgentContractBudget).toHaveBeenCalledWith(mockDb, { agentId: 'contract-agent-2', newBudgetUsd: 200 });
    });

    it('returns 500 on adjust-budget error', async () => {
      mockOps.adjustAgentContractBudget.mockRejectedValue(new Error('Budget adjust failed'));
      registerContractOps({ httpServer: httpServer as any, db: mockDb, ops: mockOps as any });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/adjust-budget');

      const response = await handler(makeRequest({ agentId: 'contract-agent-2', newBudgetUsd: 200 }));

      expect(response.status).toBe(500);
    });
  });

  describe('POST /admin/agent/contract/renew', () => {
    it('registers the route', () => {
      registerContractOps({ httpServer: httpServer as any, db: mockDb, ops: mockOps as any });
      expect(httpServer.registerRoute).toHaveBeenCalledWith(
        expect.objectContaining({ method: 'POST', path: '/admin/agent/contract/renew' }),
      );
    });

    it('calls renewAgentContract and returns 200', async () => {
      registerContractOps({ httpServer: httpServer as any, db: mockDb, ops: mockOps as any });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/renew');

      const response = await handler(makeRequest({ agentId: 'contract-agent-3', newBudgetUsd: 300 }));

      expect(response.status).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.expiresAt).toBe(9999999999);
      expect(mockOps.renewAgentContract).toHaveBeenCalledWith(mockDb, { agentId: 'contract-agent-3', newBudgetUsd: 300 });
    });

    it('returns 500 on renew error', async () => {
      mockOps.renewAgentContract.mockRejectedValue(new Error('Renew failed'));
      registerContractOps({ httpServer: httpServer as any, db: mockDb, ops: mockOps as any });
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/renew');

      const response = await handler(makeRequest({ agentId: 'contract-agent-3', newBudgetUsd: 300 }));

      expect(response.status).toBe(500);
    });
  });
});