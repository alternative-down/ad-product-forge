import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
  toMastraSafeIdentifier: (id: string) => id.replace(/[^a-zA-Z0-9-_]/g, '_'),
  LibsqlConversationStore: vi.fn(),
  readOperationalMemoryState: vi.fn().mockResolvedValue({}),
  withTimeout: vi.fn().mockImplementation(async (promise: Promise<unknown>) => promise),
}));

import type { Database } from '../../../../database/index.js';
import { registerAgentWriteOpsRoutes } from './write-ops';

const { mockReloadAgentIfLoaded } = vi.hoisted(() => ({
  mockReloadAgentIfLoaded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../capabilities/runtime.js', () => ({
  changeAgentRoleFromAdmin: vi.fn().mockResolvedValue({ success: true }),
  updateInternalChatProviderProfile: vi.fn().mockResolvedValue(undefined),
  reloadAgentIfLoaded: mockReloadAgentIfLoaded,
}));

function makeMockDb(): Database {
  return {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
    query: {
      agents: { findFirst: vi.fn().mockResolvedValue(null) },
      agentContracts: { findFirst: vi.fn().mockResolvedValue(null) },
      agentRoles: { findFirst: vi.fn().mockResolvedValue(null) },
      agentProviders: { findFirst: vi.fn().mockResolvedValue(null) },
    },
  } as unknown as Database;
}

function makeInput(db: Database) {
  return {
    db,
    workspaceBasePath: '/tmp/test-workspace',
    loaderConfig: {},
  };
}

function makeRequest(body: unknown): { bodyText: string } {
  return { bodyText: JSON.stringify(body) };
}

function getRouteHandler(httpServer: { registerRoute: Function }, method: string, path: string): Function {
  const calls = httpServer.registerRoute.mock.calls as Array<[{ method: string; path: string; handler: Function }]>;
  const match = calls.find(c => c[0].method === method && c[0].path === path);
  if (!match) throw new Error(`Route ${method} ${path} not found`);
  return match[0].handler;
}

describe('registerAgentWriteOpsRoutes', () => {
  beforeEach(() => {
    mockReloadAgentIfLoaded.mockClear();
  });

  describe('POST /admin/agent/reload', () => {
    it('returns success with agentId after loading', async () => {
      const loadAgent = vi.fn().mockResolvedValue({ runner: { forceIdle: vi.fn() } });
      const registry = new Map<string, any>();
      const db = makeMockDb();
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(db), registry, { loadAgent } as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/reload');
      const result = await handler(makeRequest({ agentId: 'agent-123' }));

      const parsed = JSON.parse((result as { body: string }).body);
      expect(parsed.success).toBe(true);
      expect(parsed.agentId).toBe('agent-123');
      expect(loadAgent).toHaveBeenCalledWith(db, expect.objectContaining({ agentId: 'agent-123' }));
    });

    it('throws if agentId missing', async () => {
      const httpServer = { registerRoute: vi.fn() };
      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), new Map(), { loadAgent: vi.fn() } as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/reload');
      await expect(handler(makeRequest({}))).rejects.toThrow();
    });
  });

  describe('POST /admin/agent/force-idle', () => {
    it('calls forceIdle on running agent', async () => {
      const forceIdle = vi.fn();
      const registry = new Map([['agent-123', { runner: { forceIdle } }]]);
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), registry, {} as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/force-idle');
      await handler(makeRequest({ agentId: 'agent-123' }));

      expect(forceIdle).toHaveBeenCalled();
    });

    it('does not throw if agent not in registry', async () => {
      const registry = new Map();
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), registry, {} as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/force-idle');
      const result = await handler(makeRequest({ agentId: 'unknown-agent' }));
      const parsed = JSON.parse((result as { body: string }).body);
      expect(parsed.success).toBe(true);
    });
  });

  describe('POST /admin/agent/rewakeup', () => {
    it('calls notifyExternalEvent on running agent', async () => {
      const notifyExternalEvent = vi.fn();
      const registry = new Map([['agent-123', { runner: { notifyExternalEvent, forceIdle: vi.fn() } }]]);
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), registry, {} as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/rewakeup');
      await handler(makeRequest({ agentId: 'agent-123' }));

      expect(notifyExternalEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'admin-rewakeup', groupKey: 'admin-rewakeup:agent-123' }),
      );
    });

    it('throws if agent not in registry and loadAgent missing', async () => {
      const registry = new Map();
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), registry, {} as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/rewakeup');
      await expect(handler(makeRequest({ agentId: 'unknown' }))).rejects.toThrow('loadAgent');
    });
  });

  describe('POST /admin/agent/contract/top-up', () => {
    it('calls topUpActiveAgentContract', async () => {
      const topUpActiveAgentContract = vi.fn().mockResolvedValue({ success: true });
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), new Map(), { topUpActiveAgentContract } as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/top-up');
      await handler(makeRequest({ agentId: 'agent-123', amountUsd: 500 }));

      expect(topUpActiveAgentContract).toHaveBeenCalled();
    });

    it('throws if amountUsd missing', async () => {
      const httpServer = { registerRoute: vi.fn() };
      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), new Map(), { topUpActiveAgentContract: vi.fn() } as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/top-up');
      await expect(handler(makeRequest({ agentId: 'agent-123' }))).rejects.toThrow();
    });
  });

  describe('POST /admin/agent/contract/adjust-budget', () => {
    it('calls adjustAgentContractBudget', async () => {
      const adjustAgentContractBudget = vi.fn().mockResolvedValue({ success: true });
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), new Map(), { adjustAgentContractBudget } as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/adjust-budget');
      await handler(makeRequest({ agentId: 'agent-123', newBudgetUsd: 10000 }));

      expect(adjustAgentContractBudget).toHaveBeenCalled();
    });

    it('throws if newBudgetUsd missing', async () => {
      const httpServer = { registerRoute: vi.fn() };
      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), new Map(), { adjustAgentContractBudget: vi.fn() } as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/adjust-budget');
      await expect(handler(makeRequest({ agentId: 'agent-123' }))).rejects.toThrow();
    });
  });

  describe('POST /admin/agent/contract/renew', () => {
    it('calls renewAgentContract', async () => {
      const renewAgentContract = vi.fn().mockResolvedValue({ success: true });
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), new Map(), { renewAgentContract } as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/renew');
      await handler(makeRequest({ agentId: 'agent-123', newBudgetUsd: 15000 }));

      expect(renewAgentContract).toHaveBeenCalled();
    });

    it('throws if newBudgetUsd missing', async () => {
      const httpServer = { registerRoute: vi.fn() };
      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), new Map(), { renewAgentContract: vi.fn() } as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/contract/renew');
      await expect(handler(makeRequest({ agentId: 'agent-123' }))).rejects.toThrow();
    });
  });

  describe('POST /admin/agent/hire', () => {
    it('calls runInternalHiring with parsed schema', async () => {
      const runInternalHiring = vi.fn().mockResolvedValue({ success: true });
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(
        httpServer as any,
        makeInput(makeMockDb()),
        new Map(),
        { runInternalHiring, reloadAgentIfLoaded: vi.fn() } as any,
      );

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/hire');
      await handler(
        makeRequest({
          hiringRequest: 'Senior Developer for test coverage',
          additionalContext: 'Focus on TypeScript',
          weeklyBudgetUsd: 5000,
        }),
      );

      expect(runInternalHiring).toHaveBeenCalled();
    });

    it('throws if required fields missing', async () => {
      const httpServer = { registerRoute: vi.fn() };
      registerAgentWriteOpsRoutes(
        httpServer as any,
        makeInput(makeMockDb()),
        new Map(),
        { runInternalHiring: vi.fn(), reloadAgentIfLoaded: vi.fn() } as any,
      );

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/hire');
      // Missing both hiringRequest and weeklyBudgetUsd
      await expect(handler(makeRequest({}))).rejects.toThrow();
    });
  });

  describe('POST /admin/agent/terminate', () => {
    it('calls runInternalTermination', async () => {
      const runInternalTermination = vi.fn().mockResolvedValue({ success: true });
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(
        httpServer as any,
        makeInput(makeMockDb()),
        new Map(),
        { runInternalTermination, reloadAgentsForRole: vi.fn() } as any,
      );

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/terminate');
      await handler(makeRequest({ agentId: 'agent-123' }));

      expect(runInternalTermination).toHaveBeenCalled();
    });
  });

  describe('POST /admin/agent/change-role', () => {
    it('calls changeAgentRoleFromAdmin', async () => {
      const changeAgentRoleFromAdmin = vi.fn().mockResolvedValue({ success: true });
      const reloadAgentsForRole = vi.fn();
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(
        httpServer as any,
        makeInput(makeMockDb()),
        new Map(),
        { changeAgentRoleFromAdmin, reloadAgentsForRole } as any,
      );

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/change-role');
      await handler(makeRequest({ agentId: 'agent-123', roleId: 'new-role' }));

      expect(changeAgentRoleFromAdmin).toHaveBeenCalled();
    });

    it('throws if roleId missing', async () => {
      const httpServer = { registerRoute: vi.fn() };
      registerAgentWriteOpsRoutes(
        httpServer as any,
        makeInput(makeMockDb()),
        new Map(),
        { changeAgentRoleFromAdmin: vi.fn(), reloadAgentsForRole: vi.fn() } as any,
      );

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/change-role');
      await expect(handler(makeRequest({ agentId: 'agent-123' }))).rejects.toThrow();
    });
  });

  describe('POST /admin/agent/github-manifest-config/update', () => {
    it('parses github manifest config and returns success', async () => {
      const httpServer = { registerRoute: vi.fn() };
      const db = makeMockDb();

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(db), new Map(), {} as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/github-manifest-config/update');
      const result = await handler(
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
              pull_request_review: false,
              issues: false,
              issue_comment: false,
              repository: false,
              workflow_run: false,
            },
          },
        }),
      );

      const parsed = JSON.parse((result as { body: string }).body);
      expect(parsed.success).toBe(true);
      expect(parsed.agentId).toBe('agent-123');
    });

    it('rejects invalid manifest config', async () => {
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(makeMockDb()), new Map(), {} as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/github-manifest-config/update');
      // Missing permissions and events
      await expect(handler(makeRequest({ agentId: 'agent-123' }))).rejects.toThrow();
    });
  });

  describe('POST /admin/agent/update-config', () => {
    it('returns error if agent not found', async () => {
      const httpServer = { registerRoute: vi.fn() };
      const db = makeMockDb();
      (db.query as any).agents = { findFirst: vi.fn().mockResolvedValue(null) };

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(db), new Map(), {} as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/update-config');
      const result = await handler(makeRequest({ agentId: 'unknown-agent', instructions: 'be helpful' }));
      const parsed = JSON.parse((result as { body: string }).body);
      expect(parsed.error).toContain('not found');
      expect((result as { status: number }).status).toBe(404);
    });

    it('returns success after updating agent config', async () => {
      const httpServer = { registerRoute: vi.fn() };
      const db = makeMockDb();
      (db.query as any).agents = { findFirst: vi.fn().mockResolvedValue({ id: 'agent-123', roleId: 'role-1' }) };
      (db.query as any).agentRoles = { findFirst: vi.fn().mockResolvedValue({ id: 'role-1', name: 'Developer', description: 'Code monkey' }) };
      (db.query as any).agentProviders = { findFirst: vi.fn().mockResolvedValue(null) };
      const mockSet = vi.fn().mockReturnThis();
      const mockWhere = vi.fn().mockResolvedValue(undefined);
      (db as any).update = vi.fn().mockReturnValue({ set: mockSet, where: mockWhere });

      registerAgentWriteOpsRoutes(httpServer as any, makeInput(db), new Map(), {} as any);

      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/update-config');
      const result = await handler(makeRequest({ agentId: 'agent-123', instructions: 'be helpful' }));

      const parsed = JSON.parse((result as { body: string }).body);
      expect(parsed.success).toBe(true);
      expect(parsed.agentId).toBe('agent-123');
      expect(mockSet).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
      expect(mockReloadAgentIfLoaded).toHaveBeenCalled();
    });
  });

  describe('registers expected number of routes', () => {
    it('registers exactly 30 routes', async () => {
      const httpServer = { registerRoute: vi.fn() };

      registerAgentWriteOpsRoutes(
        httpServer as any,
        makeInput(makeMockDb()),
        new Map(),
        {
          loadAgent: vi.fn(),
          topUpActiveAgentContract: vi.fn(),
          adjustAgentContractBudget: vi.fn(),
          renewAgentContract: vi.fn(),
          runInternalHiring: vi.fn(),
          runInternalTermination: vi.fn(),
          changeAgentRoleFromAdmin: vi.fn(),
          reloadAgentMcp: vi.fn(),
          reloadAgentIfLoaded: vi.fn(),
          reloadAgentsForRole: vi.fn(),
          updateAgentGitHubManifestConfig: vi.fn(),
          updateAgentConfig: vi.fn(),
        } as any,
      );

      expect(httpServer.registerRoute).toHaveBeenCalledTimes(30);
    
  describe('POST /admin/agent/providers/upsert', () => {
    it('returns success with agentId and providerType', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/providers/upsert');
      const resp = await handler(makeRequest({ agentId: 'a1', providerType: 'openai', credentials: { key: 'sk-xxx' } }));
      expect(resp).toEqual({ success: true, agentId: 'a1' });
    });

    it('returns success even with empty credentials', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/providers/upsert');
      const resp = await handler(makeRequest({ agentId: 'a1', providerType: 'anthropic', credentials: {} }));
      expect(resp).toEqual({ success: true, agentId: 'a1' });
    });
  });

  describe('POST /admin/agent/providers/delete', () => {
    it('returns success with agentId', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/providers/delete');
      const resp = await handler(makeRequest({ agentId: 'a2', providerType: 'openai' }));
      expect(resp).toEqual({ success: true, agentId: 'a2' });
    });
  });

  describe('POST /admin/agent/mcp/create', () => {
    it('returns success with placeholder serverId', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/create');
      const resp = await handler(makeRequest({ agentId: 'a1', name: 'test-server', transport: 'stdio' }));
      expect(resp).toMatchObject({ success: true, serverId: 'placeholder' });
    });

    it('parses optional description', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/create');
      const resp = await handler(makeRequest({ agentId: 'a1', name: 'srv', transport: 'http', description: 'My MCP server' }));
      expect(resp.serverId).toBe('placeholder');
    });
  });

  describe('POST /admin/agent/mcp/update', () => {
    it('returns success with serverId from body', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/update');
      const resp = await handler(makeRequest({ serverId: 'srv-abc', agentId: 'a1', name: 'updated-server' }));
      expect(resp).toEqual({ success: true, serverId: 'srv-abc' });
    });
  });

  describe('POST /admin/agent/mcp/delete', () => {
    it('returns success', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/delete');
      const resp = await handler(makeRequest({ serverId: 'srv-xyz', agentId: 'a1' }));
      expect(resp).toEqual({ success: true });
    });
  });

  describe('POST /admin/agent/mcp/assign', () => {
    it('returns success', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/assign');
      const resp = await handler(makeRequest({ agentId: 'a1', serverId: 'srv-abc' }));
      expect(resp).toEqual({ success: true });
    });
  });

  describe('POST /admin/agent/mcp/set-active', () => {
    it('returns success', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/set-active');
      const resp = await handler(makeRequest({ agentId: 'a1', serverId: 'srv-abc', isActive: true }));
      expect(resp).toEqual({ success: true });
    });

    it('works with isActive false', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/set-active');
      const resp = await handler(makeRequest({ agentId: 'a1', serverId: 'srv-abc', isActive: false }));
      expect(resp).toEqual({ success: true });
    });
  });

  describe('POST /admin/agent/mcp/detach', () => {
    it('returns success', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/mcp/detach');
      const resp = await handler(makeRequest({ agentId: 'a1', serverId: 'srv-abc' }));
      expect(resp).toEqual({ success: true });
    });
  });

  describe('POST /admin/agent/skills/publish-to-global', () => {
    it('returns success with skillName', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/publish-to-global');
      const resp = await handler(makeRequest({ agentId: 'a1', skillName: 'my-skill' }));
      expect(resp).toEqual({ success: true, skillName: 'my-skill' });
    });
  });

  describe('POST /admin/agent/skills/install-global', () => {
    it('returns success', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/install-global');
      const resp = await handler(makeRequest({ agentId: 'a1', skillName: 'global-skill' }));
      expect(resp).toEqual({ success: true });
    });
  });

  describe('POST /admin/agent/skills/upload', () => {
    it('returns success', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/upload');
      const resp = await handler(makeRequest({ agentId: 'a1', skillsZipBase64: 'UEsDBBQ...' }));
      expect(resp).toEqual({ success: true });
    });
  });

  describe('POST /admin/agent/skills/delete', () => {
    it('returns success', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/agent/skills/delete');
      const resp = await handler(makeRequest({ agentId: 'a1', skillName: 'old-skill' }));
      expect(resp).toEqual({ success: true });
    });
  });

  describe('POST /admin/roles/create', () => {
    it('returns success with roleId', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/create');
      const resp = await handler(makeRequest({ name: 'Developer', description: 'Dev role' }));
      expect(resp).toMatchObject({ success: true });
      expect(resp.roleId).toBeTruthy();
    });

    it('works without description', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/create');
      const resp = await handler(makeRequest({ name: 'Admin' }));
      expect(resp.success).toBe(true);
    });
  });

  describe('POST /admin/roles/update', () => {
    it('returns success with roleId', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/update');
      const resp = await handler(makeRequest({ roleId: 'role-123', name: 'Senior Dev' }));
      expect(resp).toMatchObject({ success: true, roleId: 'role-123' });
    });
  });

  describe('POST /admin/roles/delete', () => {
    it('returns success', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/delete');
      const resp = await handler(makeRequest({ roleId: 'role-456' }));
      expect(resp).toEqual({ success: true });
    });
  });

  describe('POST /admin/roles/capabilities', () => {
    it('returns success', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/capabilities');
      const resp = await handler(makeRequest({ roleId: 'role-789', capabilityName: 'memory', capabilityValue: true }));
      expect(resp).toEqual({ success: true });
    });
  });

  describe('POST /admin/roles/tool-permissions', () => {
    it('returns success', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/tool-permissions');
      const resp = await handler(makeRequest({ roleId: 'role-abc', toolName: 'send_message', allowed: true }));
      expect(resp).toEqual({ success: true });
    });

    it('works with allowed false', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/tool-permissions');
      const resp = await handler(makeRequest({ roleId: 'role-abc', toolName: 'send_message', allowed: false }));
      expect(resp).toEqual({ success: true });
    });
  });

  describe('POST /admin/roles/workflow-permissions', () => {
    it('returns success', async () => {
      const { httpServer, ops } = setup();
      registerAgentWriteOpsRoutes(httpServer, makeInput(makeMockDb()), mockRegistry, ops);
      const handler = getRouteHandler(httpServer, 'POST', '/admin/roles/workflow-permissions');
      const resp = await handler(makeRequest({ roleId: 'role-xyz', workflowName: 'deploy', allowed: true }));
      expect(resp).toEqual({ success: true });
    });
  });

});
  });
});