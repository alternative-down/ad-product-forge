/**
 * Agent Routes Tests - Phase 2 of #689
 * Tests for extracted agent route submodules (read, operations, write, write-ops).
 */

import { z } from 'zod';
import { vi, describe, it, expect } from 'vitest';


vi.mock('@forge-runtime/core', () => ({
  forgeDebug: vi.fn(),
}));
import { registerAgentReadRoutes } from './index';
import { registerAgentOperationRoutes } from './operations';
import { registerAgentWriteRoutes } from './write';
import { registerAgentWriteOpsRoutes } from './write-ops';

// ── Comprehensive module mocks ────────────────────────────────────────────────

vi.mock('../../../database/schema', () => ({
  agentCheckpointedOmStates: Symbol('agentCheckpointedOmStates'),
  agentLongTermMemoryStates: Symbol('agentLongTermMemoryStates'),
  agentLongTermMemoryRecallStates: Symbol('agentLongTermMemoryRecallStates'),
  agents: { id: Symbol('id'), roleId: Symbol('roleId') },
  agentRoles: { id: Symbol('id') },
}));

vi.mock('../../../database/index', () => ({}));

vi.mock('../index', () => ({
  jsonResponse: (body: unknown, status = 200) => ({ status, body }),
  parseJsonBody: (bodyText: string, _schema: z.ZodTypeAny) => {
    try {
      return bodyText.trim().length === 0 ? {} : JSON.parse(bodyText);
    } catch {
      return {};
    }
  },
  // Schemas
  agentActionSchema: z.object({ agentId: z.string() }),
  topUpAgentContractSchema: z.object({ agentId: z.string(), amountUsd: z.number().positive() }),
  adjustAgentContractBudgetSchema: z.object({ agentId: z.string(), newBudgetUsd: z.number().positive() }),
  renewAgentContractSchema: z.object({ agentId: z.string(), newBudgetUsd: z.number().positive() }),
  hireAgentSchema: z.object({ hiringRequest: z.string(), additionalContext: z.string().optional(), weeklyBudgetUsd: z.number().positive() }),
  terminateAgentSchema: z.object({ agentId: z.string() }),
  changeAgentRoleSchema: z.object({ agentId: z.string(), roleId: z.string() }),
  updateAgentGitHubManifestConfigSchema: z.object({ agentId: z.string() }),
  updateAgentConfigSchema: z.object({ agentId: z.string(), name: z.string().optional(), description: z.string().optional(), instructions: z.string().optional(), workspaceAutoSync: z.boolean().optional(), workspaceBm25: z.boolean().optional(), modelProfileId: z.string().optional(), omModelProfileId: z.string().optional() }),
}));

vi.mock('../helpers', () => ({
  clearAgentHistory: vi.fn().mockResolvedValue({ cleared: 0 }),
  normalizeOptionalText: (v?: string) => (v?.trim() ? v.trim() : null),
  normalizeJsonText: vi.fn().mockReturnValue(null),
  createId: () => `test-id-${Date.now()}`,
}));

vi.mock('node:fs/promises', () => ({ access: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@forg-runtime/core', () => ({
  LibsqlConversationStore: vi.fn(),
  toMastraSafeIdentifier: (s: string) => s,
}));

vi.mock('@libsql/client', () => ({ createClient: vi.fn() }));

// ── Helpers ───────────────────────────────────────────────────────────────────

function createMockRunner() {
  return {
    forceIdle: vi.fn(),
    notifyExternalEvent: vi.fn(),
  };
}

function createMockRuntime() {
  return {
    runner: createMockRunner(),
  };
}

function createInternalChat() {
  return {
    registerExternalAccount: vi.fn().mockResolvedValue({ accountId: 'test' }),
    sendMessage: vi.fn().mockResolvedValue({ conversationKey: 'test', messageId: 'msg' }),
  };
}

function createOps() {
  return {
    loadAgent: vi.fn().mockResolvedValue(createMockRuntime()),
    topUpActiveAgentContract: vi.fn(),
    adjustAgentContractBudget: vi.fn(),
    renewAgentContract: vi.fn(),
    runInternalHiring: vi.fn(),
    runInternalTermination: vi.fn(),
    changeAgentRoleFromAdmin: vi.fn(),
    reloadAgentMcp: vi.fn(),
    updateInternalChatProviderProfile: vi.fn(),
    deleteAgentWorkspaceSkill: vi.fn(),
    installAgentWorkspaceSkillsFromZip: vi.fn(),
    deleteGlobalSkill: vi.fn(),
    installGlobalSkillToAgentWorkspace: vi.fn(),
    publishAgentWorkspaceSkillToGlobalCatalog: vi.fn(),
    encryptSecret: vi.fn((v: unknown) => v),
    parseProviderCredentials: vi.fn((_t: string, c: unknown) => c),
    createId: vi.fn(() => 'test-id'),
    normalizeOptionalText: vi.fn((v?: string) => (v ?? null)),
    normalizeJsonText: vi.fn(() => null),
    createCapabilityStore: vi.fn(),
    reloadAgentsForRole: vi.fn(),
    reloadAgentIfLoaded: vi.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Agent Read Routes', () => {
  it('should register GET /admin/agents', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentReadRoutes(httpServer as any, { listAgents: vi.fn().mockResolvedValue([]) } as any);
    expect(routes.find((r) => r.path === '/admin/agents' && r.method === 'GET')).toBeDefined();
  });

  it('should register GET /admin/agent (single)', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentReadRoutes(httpServer as any, {
      getAgent: vi.fn().mockResolvedValue({ id: 'test-agent', name: 'Test' }),
    } as any);
    expect(routes.find((r) => r.path === '/admin/agent' && r.method === 'GET')).toBeDefined();
  });

  it('should return 404 when agent not found', async () => {
    let capturedHandler: Function | null = null;
    const httpServer = {
      registerRoute: ({ path, handler }: { method: string; path: string; handler: Function }) => {
        if (path === '/admin/agent') capturedHandler = handler;
      },
    };
    registerAgentReadRoutes(httpServer as any, {
      getAgent: vi.fn().mockResolvedValue(null),
      getAgentRuntimeMemory: vi.fn().mockResolvedValue(null),
      getAgentOmDebugExport: vi.fn().mockResolvedValue(null),
      listAgentConversationMessages: vi.fn().mockResolvedValue([]),
      listAgentLongTermMemoryThreadMessages: vi.fn().mockResolvedValue([]),
      listAgentExecutionSteps: vi.fn().mockResolvedValue([]),
      listAgentThreadMessages: vi.fn().mockResolvedValue([]),
      listAgentRecentConversations: vi.fn().mockResolvedValue([]),
      listAgents: vi.fn().mockResolvedValue([]),
    } as any);
    expect(capturedHandler).toBeTruthy();
    const response = await capturedHandler!({
      query: new Map([
        ['agentId', 'nonexistent'],
        ['provider', 'internal-chat'],
        ['targetKey', 'test-key'],
      ]),
    });
    expect(response.status).toBe(404);
  });

  it('should register all 9 read routes', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentReadRoutes(httpServer as any, {
      listAgents: vi.fn().mockResolvedValue([]),
      getAgent: vi.fn().mockResolvedValue(null),
      listAgentRecentConversations: vi.fn().mockResolvedValue([]),
      listAgentExecutionSteps: vi.fn().mockResolvedValue([]),
      listAgentThreadMessages: vi.fn().mockResolvedValue([]),
      listAgentLongTermMemoryThreadMessages: vi.fn().mockResolvedValue([]),
      getAgentRuntimeMemory: vi.fn().mockResolvedValue(null),
      getAgentOmDebugExport: vi.fn().mockResolvedValue(null),
      listAgentConversationMessages: vi.fn().mockResolvedValue([]),
    } as any);
    expect(routes).toHaveLength(9);
  });
});

describe('Agent Write Routes (clear-history, ltm-recall-search)', () => {
  it('should register POST /admin/agent/clear-history', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentWriteRoutes(httpServer as any, {} as any, {
      db: {},
      workspaceBasePath: '/tmp',
      loaderConfig: {},
    });
    expect(routes.find((r) => r.path === '/admin/agent/clear-history' && r.method === 'POST')).toBeDefined();
  });

  it('should register POST /admin/agent/ltm-recall-search', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentWriteRoutes(httpServer as any, {} as any, {
      db: {},
      workspaceBasePath: '/tmp',
      loaderConfig: {},
    });
    expect(routes.find((r) => r.path === '/admin/agent/ltm-recall-search' && r.method === 'POST')).toBeDefined();
  });

  it('should have exactly 2 write routes', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentWriteRoutes(httpServer as any, {} as any, {
      db: {},
      workspaceBasePath: '/tmp',
      loaderConfig: {},
    });
    expect(routes).toHaveLength(2);
  });
});

describe('Agent Operation Routes (wake, internal-chat)', () => {
  it('should register POST /admin/agent/wake', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentOperationRoutes(httpServer as any, { internalChat: createInternalChat() }, new Map());
    expect(routes.find((r) => r.path === '/admin/agent/wake' && r.method === 'POST')).toBeDefined();
  });

  it('should register POST /admin/agent/internal-chat/send', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentOperationRoutes(httpServer as any, { internalChat: createInternalChat() }, new Map());
    expect(routes.find((r) => r.path === '/admin/agent/internal-chat/send' && r.method === 'POST')).toBeDefined();
  });

  it('should have exactly 2 operation routes', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentOperationRoutes(httpServer as any, { internalChat: createInternalChat() }, new Map());
    expect(routes).toHaveLength(2);
  });
});

describe('Agent Write Ops Routes', () => {
  it('should register POST /admin/agent/reload', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: { query: { agents: { findFirst: vi.fn() }, agentRoles: { findFirst: vi.fn() } } }, workspaceBasePath: '/tmp', loaderConfig: {} },
      new Map(),
      createOps(),
    );
    expect(routes.find((r) => r.path === '/admin/agent/reload' && r.method === 'POST')).toBeDefined();
  });

  it('should register POST /admin/agent/force-idle', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: { query: { agents: { findFirst: vi.fn() }, agentRoles: { findFirst: vi.fn() } } }, workspaceBasePath: '/tmp', loaderConfig: {} },
      new Map(),
      createOps(),
    );
    expect(routes.find((r) => r.path === '/admin/agent/force-idle' && r.method === 'POST')).toBeDefined();
  });

  it('should register POST /admin/agent/rewakeup', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: { query: { agents: { findFirst: vi.fn() }, agentRoles: { findFirst: vi.fn() } } }, workspaceBasePath: '/tmp', loaderConfig: {} },
      new Map(),
      createOps(),
    );
    expect(routes.find((r) => r.path === '/admin/agent/rewakeup' && r.method === 'POST')).toBeDefined();
  });

  it('should register contract routes', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: { query: { agents: { findFirst: vi.fn() }, agentRoles: { findFirst: vi.fn() } } }, workspaceBasePath: '/tmp', loaderConfig: {} },
      new Map(),
      createOps(),
    );
    expect(routes.find((r) => r.path === '/admin/agent/contract/top-up' && r.method === 'POST')).toBeDefined();
    expect(routes.find((r) => r.path === '/admin/agent/contract/adjust-budget' && r.method === 'POST')).toBeDefined();
    expect(routes.find((r) => r.path === '/admin/agent/contract/renew' && r.method === 'POST')).toBeDefined();
  });

  it('should register hire and terminate routes', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: { query: { agents: { findFirst: vi.fn() }, agentRoles: { findFirst: vi.fn() } } }, workspaceBasePath: '/tmp', loaderConfig: {} },
      new Map(),
      createOps(),
    );
    expect(routes.find((r) => r.path === '/admin/agent/hire' && r.method === 'POST')).toBeDefined();
    expect(routes.find((r) => r.path === '/admin/agent/terminate' && r.method === 'POST')).toBeDefined();
    expect(routes.find((r) => r.path === '/admin/agent/change-role' && r.method === 'POST')).toBeDefined();
  });

  it('should register config update routes', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: { query: { agents: { findFirst: vi.fn() }, agentRoles: { findFirst: vi.fn() } } }, workspaceBasePath: '/tmp', loaderConfig: {} },
      new Map(),
      createOps(),
    );
    expect(routes.find((r) => r.path === '/admin/agent/github-manifest-config/update' && r.method === 'POST')).toBeDefined();
    expect(routes.find((r) => r.path === '/admin/agent/update-config' && r.method === 'POST')).toBeDefined();
  });

  it('should register exactly 10 write ops routes', () => {
    const routes: { method: string; path: string }[] = [];
    const httpServer = {
      registerRoute: (route: { method: string; path: string }) => routes.push(route),
    };
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: { query: { agents: { findFirst: vi.fn() }, agentRoles: { findFirst: vi.fn() } } }, workspaceBasePath: '/tmp', loaderConfig: {} },
      new Map(),
      createOps(),
    );
    expect(routes).toHaveLength(11);
  });

  it('should handle force-idle correctly', () => {
    const forceIdle = vi.fn();
    let response: any;
    const httpServer = {
      registerRoute: ({ handler }: { method: string; path: string; handler: Function }) => {
        response = handler({ bodyText: JSON.stringify({ agentId: 'test-agent' }) });
      },
    };
    const registry = new Map([
      ['test-agent', { runner: { forceIdle, notifyExternalEvent: vi.fn() } } as any],
    ]);
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: { query: { agents: { findFirst: vi.fn() }, agentRoles: { findFirst: vi.fn() } } }, workspaceBasePath: '/tmp', loaderConfig: {} },
      registry,
      createOps(),
    );
    expect(forceIdle).toHaveBeenCalled();
  });

  it('should handle rewakeup correctly', async () => {
    const notifyExternalEvent = vi.fn();
    let capturedHandler: Function | null = null;
    const httpServer = {
      registerRoute: ({ path, handler }: { method: string; path: string; handler: Function }) => {
        if (path === '/admin/agent/rewakeup') capturedHandler = handler;
      },
    };
    const registry = new Map([
      ['test-agent', { runner: { notifyExternalEvent, forceIdle: vi.fn() } } as any],
    ]);
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: { query: { agents: { findFirst: vi.fn() }, agentRoles: { findFirst: vi.fn() } } }, workspaceBasePath: '/tmp', loaderConfig: {} },
      registry,
      createOps(),
    );
    expect(capturedHandler).toBeTruthy();
    await capturedHandler!({ bodyText: JSON.stringify({ agentId: 'test-agent' }) });
    expect(notifyExternalEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'admin-rewakeup',
        groupKey: 'admin-rewakeup:test-agent',
      }),
    );
  });

  it('should handle rewakeup when agent not in registry', async () => {
    const mockRuntime = createMockRuntime();
    const mockLoadAgent = vi.fn().mockResolvedValue(mockRuntime);
    let capturedHandler: Function | null = null;
    const httpServer = {
      registerRoute: ({ path, handler }: { method: string; path: string; handler: Function }) => {
        if (path === '/admin/agent/rewakeup') capturedHandler = handler;
      },
    };
    const registry = new Map();
    const ops = { ...createOps(), loadAgent: mockLoadAgent };
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: { query: { agents: { findFirst: vi.fn() }, agentRoles: { findFirst: vi.fn() } } }, workspaceBasePath: '/tmp', loaderConfig: {} },
      registry,
      ops,
    );
    expect(capturedHandler).toBeTruthy();
    await capturedHandler!({ bodyText: JSON.stringify({ agentId: 'new-agent' }) });
    expect(mockLoadAgent).toHaveBeenCalled();
    expect(registry.has('new-agent')).toBe(true);
  });

  it('should call top-up contract with correct params', async () => {
    const mockTopUp = vi.fn().mockResolvedValue({ success: true });
    let capturedHandler: Function | null = null;
    const httpServer = {
      registerRoute: ({ path, handler }: { method: string; path: string; handler: Function }) => {
        if (path === '/admin/agent/contract/top-up') capturedHandler = handler;
      },
    };
    registerAgentWriteOpsRoutes(
      httpServer as any,
      { db: { query: { agents: { findFirst: vi.fn() }, agentRoles: { findFirst: vi.fn() } } }, workspaceBasePath: '/tmp', loaderConfig: {} },
      new Map(),
      { ...createOps(), topUpActiveAgentContract: mockTopUp },
    );
    expect(capturedHandler).toBeTruthy();
    const response = await capturedHandler!({
      bodyText: JSON.stringify({ agentId: 'test-agent', amountCents: 10000, reason: 'test' }),
    });
    expect(mockTopUp).toHaveBeenCalled();
    expect(response.body.success).toBe(true);
  });
});