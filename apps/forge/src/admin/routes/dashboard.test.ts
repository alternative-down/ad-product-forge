/**
 * Unit tests for admin/routes/dashboard.ts
 *
 * Covers: registerDashboardRoutes
 *  - GET /admin/overview (analytics aggregation: cash + agents + contracts)
 *  - GET /admin/roles (delegates to systemRM.listRoles)
 *  - Error handling for both routes
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { registerDashboardRoutes } from './dashboard';
import { errorMsg } from '../../agents/error-formatting';

interface RouteHandler {
  method: string;
  path: string;
  handler: () => Promise<unknown>;
}

function createMockHttpServer() {
  const routes: RouteHandler[] = [];
  return {
    routes,
    registerRoute: vi.fn((opts: { method: string; path: string; handler: () => Promise<unknown> }) => {
      routes.push(opts);
    }),
    getHandler(path: string, method = 'GET'): RouteHandler {
      const r = routes.find((x) => x.path === path && x.method === method);
      if (!r) throw new Error(`no handler for ${method} ${path}`);
      return r;
    },
  };
}

function createMockDb(rows: { id: string; executionState: string; roleId: string | null }[] = []) {
  const activeContractRows = [{ id: 'c1' }, { id: 'c2' }];
  return {
    query: {
      agents: {
        findMany: vi.fn().mockResolvedValue(rows),
      },
      agentExecutionContracts: {
        findMany: vi.fn().mockResolvedValue(activeContractRows),
      },
    },
  };
}

function createMockRegistry(size = 3) {
  return { size };
}

function createMockFinance(opts: { balanceUsd?: number; throws?: boolean } = {}) {
  const { balanceUsd = 1234.56, throws = false } = opts;
  return {
    getCompanyCashBalance: vi.fn().mockImplementation(async () => {
      if (throws) throw new Error('finance-balance-failure');
      return { balanceUsd };
    }),
    listCompanyCashMovements: vi.fn().mockImplementation(async () => {
      if (throws) throw new Error('finance-movements-failure');
      return { items: [{ id: 'm1' }, { id: 'm2' }] };
    }),
  };
}

function createMockSystemRM(opts: { roles?: unknown[]; throws?: boolean } = {}) {
  const { roles = [{ id: 'admin' }, { id: 'editor' }], throws = false } = opts;
  return {
    listRoles: vi.fn().mockImplementation(async () => {
      if (throws) throw new Error('system-rm-roles-failure');
      return roles;
    }),
  };
}

describe('registerDashboardRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('registration', () => {
    it('registers exactly two routes', () => {
      const http = createMockHttpServer();
      const db = createMockDb();
      const registry = createMockRegistry();
      const finance = createMockFinance();
      const systemRM = createMockSystemRM();

      registerDashboardRoutes({
        httpServer: http as never,
        db: db as never,
        registry: registry as never,
        finance: finance as never,
        readModel: {} as never,
        systemRM: systemRM as never,
      });

      expect(http.routes).toHaveLength(2);
    });

    it('registers GET /admin/overview', () => {
      const http = createMockHttpServer();
      const db = createMockDb();
      registerDashboardRoutes({
        httpServer: http as never,
        db: db as never,
        registry: createMockRegistry() as never,
        finance: createMockFinance() as never,
        readModel: {} as never,
        systemRM: createMockSystemRM() as never,
      });
      expect(() => http.getHandler('/admin/overview')).not.toThrow();
    });

    it('registers GET /admin/roles', () => {
      const http = createMockHttpServer();
      const db = createMockDb();
      registerDashboardRoutes({
        httpServer: http as never,
        db: db as never,
        registry: createMockRegistry() as never,
        finance: createMockFinance() as never,
        readModel: {} as never,
        systemRM: createMockSystemRM() as never,
      });
      expect(() => http.getHandler('/admin/roles')).not.toThrow();
    });
  });

  describe('GET /admin/overview', () => {
    it('returns aggregated totals and cash data on success', async () => {
      const http = createMockHttpServer();
      const db = createMockDb([
        { id: 'a1', executionState: 'idle', roleId: 'admin' },
        { id: 'a2', executionState: 'running', roleId: 'admin' },
        { id: 'a3', executionState: 'absent', roleId: 'editor' },
        { id: 'a4', executionState: 'idle', roleId: null },
      ]);
      const registry = createMockRegistry(7);
      const finance = createMockFinance({ balanceUsd: 9999.99 });

      registerDashboardRoutes({
        httpServer: http as never,
        db: db as never,
        registry: registry as never,
        finance: finance as never,
        readModel: {} as never,
        systemRM: createMockSystemRM() as never,
      });

      const handler = http.getHandler('/admin/overview');
      const result = (await handler.handler()) as {
        body: string;
        headers: Record<string, string>;
      };
      const parsed = JSON.parse(result.body) as {
        totals: {
          agents: number;
          loadedAgents: number;
          idleAgents: number;
          runningAgents: number;
          absentAgents: number;
          roles: number;
          activeContracts: number;
        };
        cash: { balanceUsd: number; recentMovements: unknown[] };
      };

      expect(parsed.totals.agents).toBe(4);
      expect(parsed.totals.loadedAgents).toBe(7);
      expect(parsed.totals.idleAgents).toBe(2);
      expect(parsed.totals.runningAgents).toBe(1);
      expect(parsed.totals.absentAgents).toBe(1);
      expect(parsed.totals.roles).toBe(2);
      expect(parsed.totals.activeContracts).toBe(2);
      expect(parsed.cash.balanceUsd).toBe(9999.99);
      expect(parsed.cash.recentMovements).toHaveLength(2);
    });

    it('counts distinct roleIds, not role (regression for #5481)', async () => {
      const http = createMockHttpServer();
      const db = createMockDb([
        { id: 'a1', executionState: 'idle', roleId: 'admin' },
        { id: 'a2', executionState: 'idle', roleId: 'editor' },
        { id: 'a3', executionState: 'idle', roleId: 'viewer' },
        { id: 'a4', executionState: 'idle', roleId: null },
      ]);
      registerDashboardRoutes({
        httpServer: http as never,
        db: db as never,
        registry: createMockRegistry() as never,
        finance: createMockFinance() as never,
        readModel: {} as never,
        systemRM: createMockSystemRM() as never,
      });
      const handler = http.getHandler('/admin/overview');
      const result = (await handler.handler()) as { body: string };
      const parsed = JSON.parse(result.body) as { totals: { roles: number } };
      // 3 distinct roleIds (admin/editor/viewer); null is filtered.
      // If bug returns (uses 'role' field instead of 'roleId'), all rows
      // would be undefined and the set size would be 1, not 3.
      expect(parsed.totals.roles).toBe(3);
    });

    it('treats empty executionState as absent', async () => {
      const http = createMockHttpServer();
      const db = createMockDb([{ id: 'a1', executionState: '', roleId: null }]);
      registerDashboardRoutes({
        httpServer: http as never,
        db: db as never,
        registry: createMockRegistry() as never,
        finance: createMockFinance() as never,
        readModel: {} as never,
        systemRM: createMockSystemRM() as never,
      });
      const handler = http.getHandler('/admin/overview');
      const result = (await handler.handler()) as { body: string };
      const parsed = JSON.parse(result.body) as { totals: { absentAgents: number } };
      expect(parsed.totals.absentAgents).toBe(1);
    });

    it('returns 500 with error message when finance throws', async () => {
      const http = createMockHttpServer();
      const db = createMockDb([]);
      const finance = createMockFinance({ throws: true });
      registerDashboardRoutes({
        httpServer: http as never,
        db: db as never,
        registry: createMockRegistry() as never,
        finance: finance as never,
        readModel: {} as never,
        systemRM: createMockSystemRM() as never,
      });
      const handler = http.getHandler('/admin/overview');
      const result = (await handler.handler()) as { body: string; status?: number };
      const parsed = JSON.parse(result.body) as { error: string };
      expect(parsed.error).toBe(errorMsg(new Error('finance-balance-failure')));
    });

    it('passes through non-Error throwables as error string', async () => {
      const http = createMockHttpServer();
      const db = createMockDb([]);
      const finance = {
        getCompanyCashBalance: vi.fn().mockRejectedValue('string-failure'),
        listCompanyCashMovements: vi.fn().mockResolvedValue({ items: [] }),
      };
      registerDashboardRoutes({
        httpServer: http as never,
        db: db as never,
        registry: createMockRegistry() as never,
        finance: finance as never,
        readModel: {} as never,
        systemRM: createMockSystemRM() as never,
      });
      const handler = http.getHandler('/admin/overview');
      const result = (await handler.handler()) as { body: string };
      const parsed = JSON.parse(result.body) as { error: string };
      expect(typeof parsed.error).toBe('string');
      expect(parsed.error.length).toBeGreaterThan(0);
    });
  });

  describe('GET /admin/roles', () => {
    it('returns roles payload from systemRM', async () => {
      const http = createMockHttpServer();
      const roles = [{ id: 'admin' }, { id: 'editor' }, { id: 'viewer' }];
      const systemRM = createMockSystemRM({ roles });
      registerDashboardRoutes({
        httpServer: http as never,
        db: createMockDb() as never,
        registry: createMockRegistry() as never,
        finance: createMockFinance() as never,
        readModel: {} as never,
        systemRM: systemRM as never,
      });
      const handler = http.getHandler('/admin/roles');
      const result = (await handler.handler()) as { body: string };
      const parsed = JSON.parse(result.body);
      expect(parsed).toEqual(roles);
    });

    it('returns 500 when systemRM throws', async () => {
      const http = createMockHttpServer();
      const systemRM = createMockSystemRM({ throws: true });
      registerDashboardRoutes({
        httpServer: http as never,
        db: createMockDb() as never,
        registry: createMockRegistry() as never,
        finance: createMockFinance() as never,
        readModel: {} as never,
        systemRM: systemRM as never,
      });
      const handler = http.getHandler('/admin/roles');
      const result = (await handler.handler()) as { body: string };
      const parsed = JSON.parse(result.body) as { error: string };
      expect(parsed.error).toBe(errorMsg(new Error('system-rm-roles-failure')));
    });
  });
});
