/**
 * Coverage test for apps/forge/src/admin/routes.ts.
 *
 * Goal: 60%+ line/branch coverage on the wiring function `registerAdminRoutes`.
 *
 * Strategy: this is a "wiring test". We mock all sub-`register*Routes` functions
 * (so they don't try to set up real HTTP routes) and mock the heavy store/read-model
 * factories (so they don't try to access a real db). Then we call `registerAdminRoutes`
 * with a fake input and assert:
 *   1. The function runs without throwing
 *   2. Each sub-`register*Routes` is called exactly once
 *   3. Each store/read-model factory is called with the expected input
 *
 * Per L#NN-9 9b: do not duplicate the L#19 tripwires in
 * apps/forge/src/admin/routes-registration.test.ts (parse imports) or
 * apps/forge/src/admin/routes-registered.test.ts (route registration smoke).
 * Those are Kaelen/Veritas scope. We test the WIRING (which function gets which
 * store) — a complementary layer.
 *
 * Per L#NN-17 Class 1 tripwire: if any of the `register*Routes` calls below are
 * silently dropped (e.g., L#NN-9 9b sub-form: import with underscore prefix
 * without the call site), this test would fail because the mock would not be
 * called.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Database } from '../database/client';

// Mock all sub-register*Routes via vi.hoisted so they're available in the factory
const mocks = vi.hoisted(() => {
  const fn = () => vi.fn();
  return {
    registerAgentOperationRoutes: fn(),
    registerAgentSkillsWriteRoutes: fn(),
    registerAgentSchedulesWriteRoutes: fn(),
    registerAgentWriteOpsRoutes: fn(),
    registerDashboardRoutes: fn(),
    registerSystemReadRoutes: fn(),
    registerFinanceReadRoutes: fn(),
    registerAgentBaseRoutes: fn(),
    registerAgentReadRoutes: fn(),
    registerAgentStepsRoutes: fn(),
    registerAgentConversationsRoutes: fn(),
    registerAgentMemoryRoutes: fn(),
    registerAgentMetricsRoutes: fn(),
    registerAgentContractRoutes: fn(),
    registerAgentMcpRoutes: fn(),
    registerAgentSchedulesRoutes: fn(),
    registerAgentNotificationsRoutes: fn(),
    registerAgentProviderMcpRoutes: fn(),
    registerSystemWriteRoutes: fn(),
    registerFinanceWriteRoutes: fn(),
    registerInternalChatRoutes: fn(),
    registerAdminWebhooks: fn(),
  };
});

// Mock sub-register*Routes (the "outbound" calls from registerAdminRoutes)
vi.mock('./routes/internal-chat/index', () => ({
  registerInternalChatRoutes: mocks.registerInternalChatRoutes,
}));
vi.mock('./routes/agents/detail-read', () => ({
  registerAgentBaseRoutes: mocks.registerAgentBaseRoutes,
  registerAgentStepsRoutes: mocks.registerAgentStepsRoutes,
  registerAgentConversationsRoutes: mocks.registerAgentConversationsRoutes,
  registerAgentMemoryRoutes: mocks.registerAgentMemoryRoutes,
  registerAgentMetricsRoutes: mocks.registerAgentMetricsRoutes,
  registerAgentContractRoutes: mocks.registerAgentContractRoutes,
  registerAgentMcpRoutes: mocks.registerAgentMcpRoutes,
  registerAgentSchedulesRoutes: mocks.registerAgentSchedulesRoutes,
  registerAgentNotificationsRoutes: mocks.registerAgentNotificationsRoutes,
}));
vi.mock('./routes/agents/provider-mcp', () => ({
  registerAgentProviderMcpRoutes: mocks.registerAgentProviderMcpRoutes,
}));
vi.mock('./routes/agents/read', () => ({
  registerAgentReadRoutes: mocks.registerAgentReadRoutes,
}));
vi.mock('./routes/agents/operations', () => ({
  registerAgentOperationRoutes: mocks.registerAgentOperationRoutes,
}));
vi.mock('./routes/agents/write-ops', () => ({
  registerAgentWriteOpsRoutes: mocks.registerAgentWriteOpsRoutes,
}));
vi.mock('./routes/agents/skills-write', () => ({
  registerAgentSkillsWriteRoutes: mocks.registerAgentSkillsWriteRoutes,
}));
vi.mock('./routes/agents/schedule-write', () => ({
  registerAgentSchedulesWriteRoutes: mocks.registerAgentSchedulesWriteRoutes,
}));
vi.mock('./routes/dashboard', () => ({
  registerDashboardRoutes: mocks.registerDashboardRoutes,
}));
vi.mock('./routes/system/read', () => ({
  registerSystemReadRoutes: mocks.registerSystemReadRoutes,
}));
vi.mock('./routes/system/write', () => ({
  registerSystemWriteRoutes: mocks.registerSystemWriteRoutes,
}));
vi.mock('./routes/finance/read', () => ({
  registerFinanceReadRoutes: mocks.registerFinanceReadRoutes,
}));
vi.mock('./routes/finance/write', () => ({
  registerFinanceWriteRoutes: mocks.registerFinanceWriteRoutes,
}));
vi.mock('./routes/webhooks/register', () => ({
  registerAdminWebhooks: mocks.registerAdminWebhooks,
}));

// Mock the read-model + store factories (the "inbound" deps of registerAdminRoutes)
const stores = vi.hoisted(() => ({
  readModel: {
    getAgent: vi.fn(),
    getApplicationMigrations: vi.fn(),
    listAgentRecentConversations: vi.fn(),
    getAgentRuntimeMemory: vi.fn(),
  },
  systemRM: { some: 'systemRM' },
  finance: { some: 'finance' },
  companyPayables: { some: 'companyPayables' },
  capabilities: { some: 'capabilities' },
  llmSettings: { some: 'llmSettings' },
  llmModelPrices: { some: 'llmModelPrices' },
  systemSettings: { some: 'systemSettings' },
  agentContracts: { some: 'agentContracts' },
  registry: { some: 'registry' },
  companyCash: { some: 'companyCash' },
  emailMailboxes: { some: 'emailMailboxes' },
}));

const factories = vi.hoisted(() => ({
  createAdminReadModel: vi.fn(() => stores.readModel),
  createSystemReadModel: vi.fn(() => stores.systemRM),
  createMicroErpReadModel: vi.fn(() => stores.finance),
  createCompanyPayables: vi.fn(() => stores.companyPayables),
  createCapabilityStore: vi.fn(() => stores.capabilities),
  createCompanyCashOperations: vi.fn(() => stores.companyCash),
  createLlmSettingsStore: vi.fn(() => stores.llmSettings),
  createLlmModelPriceStore: vi.fn(() => stores.llmModelPrices),
  createSystemSettingsStore: vi.fn(() => stores.systemSettings),
  createAgentContractStore: vi.fn(() => stores.agentContracts),
  createPerAgentEmailManager: vi.fn(() => stores.emailMailboxes),
  getInternalAgentRegistry: vi.fn(() => stores.registry),
}));

vi.mock('./read-model', () => ({
  createAdminReadModel: factories.createAdminReadModel,
}));
vi.mock('./read-model/system', () => ({
  createSystemReadModel: factories.createSystemReadModel,
}));
vi.mock('../micro-erp/read-model', () => ({
  createMicroErpReadModel: factories.createMicroErpReadModel,
}));
vi.mock('../finance/company-payables', () => ({
  createCompanyPayables: factories.createCompanyPayables,
}));
vi.mock('../capabilities/store', () => ({
  createCapabilityStore: factories.createCapabilityStore,
}));
vi.mock('../finance/company-cash-operations', () => ({
  createCompanyCashOperations: factories.createCompanyCashOperations,
}));
vi.mock('../llm/settings-store', () => ({
  createLlmSettingsStore: factories.createLlmSettingsStore,
}));
vi.mock('../llm/model-price-store', () => ({
  createLlmModelPriceStore: factories.createLlmModelPriceStore,
}));
vi.mock('../system-settings/store', () => ({
  createSystemSettingsStore: factories.createSystemSettingsStore,
}));
vi.mock('../agents/agent-contract-store', () => ({
  createAgentContractStore: factories.createAgentContractStore,
}));
vi.mock('../agents/internal-agent-registry', () => ({
  getInternalAgentRegistry: factories.getInternalAgentRegistry,
  createPerAgentEmailManager: factories.createPerAgentEmailManager,
}));

// Mock @forge-runtime/core to prevent module-resolution cascade into
// agent-runtime-core/integrations (not built in this workspace).
// All routes.ts imports from @forge-runtime/core are underscore-prefixed (unused),
// so returning empty objects is sufficient.
vi.mock('@forge-runtime/core', () => ({
  getAnthropicCliAuthFilePath: vi.fn(),
  getAnthropicSetupTokenFilePath: vi.fn(),
  getOpenAICodexCliAuthFilePath: vi.fn(),
  LibsqlConversationStore: vi.fn(),
  oauthStore: vi.fn(),
  syncAnthropicCredential: vi.fn(),
  syncOpenAICodexCredential: vi.fn(),
  forgeDebug: vi.fn(),
  toMastraSafeIdentifier: vi.fn(),
}));

import { registerAdminRoutes } from './routes';
import type { AdminRouteContext } from './routes';

function makeContext(): AdminRouteContext {
  return {
    db: {} as Database,
    httpServer: {} as any,
    loaderConfig: {} as any,
    schedules: {} as any,
    workspaceBasePath: '/tmp/ws',
    githubApps: {} as any,
    emailMailboxes: null,
    coolify: null,
    integrations: { some: 'integrations' } as any,
    internalChat: {} as any,
  };
}

beforeEach(() => {
  // Clear all mocks between tests
  Object.values(mocks).forEach((m) => (m as ReturnType<typeof vi.fn>).mockClear());
  Object.values(factories).forEach((f) => (f as ReturnType<typeof vi.fn>).mockClear());
});

describe('registerAdminRoutes wiring (#5320 coverage)', () => {
  it('runs without throwing on a minimal valid input', () => {
    const ctx = makeContext();
    expect(() => registerAdminRoutes(ctx)).not.toThrow();
  });

  it('creates the read model with the expected args', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(factories.createAdminReadModel).toHaveBeenCalledTimes(1);
    expect(factories.createAdminReadModel).toHaveBeenCalledWith({
      db: ctx.db,
      workspaceBasePath: ctx.workspaceBasePath,
      githubApps: ctx.githubApps,
      internalChat: ctx.internalChat,
    });
  });

  it('creates the per-agent email manager (currently unused, #eslint-disable)', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(factories.createPerAgentEmailManager).toHaveBeenCalledTimes(1);
    expect(factories.createPerAgentEmailManager).toHaveBeenCalledWith(ctx.db);
  });

  it('creates the heavy store factories exactly once each', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    // L#NN-9 9b: if any of these silently regress to 0 calls, that means the
    // variable was removed or the create* function was unused. Either way, FAIL.
    const oneTimeFactories = [
      'createMicroErpReadModel',
      'createCompanyPayables',
      'createCapabilityStore',
      'createLlmSettingsStore',
      'createLlmModelPriceStore',
      'createSystemSettingsStore',
      'createAgentContractStore',
      'createSystemReadModel',
      'getInternalAgentRegistry',
      'createCompanyCashOperations',
    ] as const;
    for (const name of oneTimeFactories) {
      expect(factories[name]).toHaveBeenCalledTimes(1);
    }
  });

  it('passes db into db-bound store factories', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    const dbArg = (factories.createMicroErpReadModel.mock.calls[0] as unknown[] | undefined)?.[0];
    const dbArg2 = (factories.createCompanyPayables.mock.calls[0] as unknown[] | undefined)?.[0];
    const dbArg3 = (factories.createCapabilityStore.mock.calls[0] as unknown[] | undefined)?.[0];
    expect(dbArg).toBe(ctx.db);
    expect(dbArg2).toBe(ctx.db);
    expect(dbArg3).toBe(ctx.db);
  });

  it('registers agent operation routes with the real registry (#1046 fix)', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerAgentOperationRoutes).toHaveBeenCalledTimes(1);
    // The 3rd arg is the registry — must be the LIVE registry, not a snapshot
    const args = mocks.registerAgentOperationRoutes.mock.calls[0];
    expect(args?.[0]).toBe(ctx.httpServer);
    expect(args?.[1]).toEqual({ internalChat: ctx.internalChat });
    expect(args?.[2]).toBe(stores.registry);
  });

  it('registers agent skills write routes with the expected context', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerAgentSkillsWriteRoutes).toHaveBeenCalledTimes(1);
    expect(mocks.registerAgentSkillsWriteRoutes).toHaveBeenCalledWith(ctx.httpServer, {
      db: ctx.db,
      loaderConfig: ctx.loaderConfig,
      workspaceBasePath: ctx.workspaceBasePath,
    });
  });

  it('registers agent schedules write routes with the schedules manager', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerAgentSchedulesWriteRoutes).toHaveBeenCalledTimes(1);
    expect(mocks.registerAgentSchedulesWriteRoutes).toHaveBeenCalledWith(ctx.httpServer, {
      schedules: ctx.schedules,
    });
  });

  it('registers agent write-ops routes with input + registry + ops bundle', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerAgentWriteOpsRoutes).toHaveBeenCalledTimes(1);
    const args = mocks.registerAgentWriteOpsRoutes.mock.calls[0];
    expect(args?.[0]).toBe(ctx.httpServer);
    expect(args?.[1]).toBe(ctx);
    expect(args?.[2]).toBe(stores.registry);
    // ops bundle has 7 keys
    expect(args?.[3]).toHaveProperty('loadAgent');
    expect(args?.[3]).toHaveProperty('topUpActiveAgentContract');
    expect(args?.[3]).toHaveProperty('adjustAgentContractBudget');
    expect(args?.[3]).toHaveProperty('renewAgentContract');
    expect(args?.[3]).toHaveProperty('runInternalHiring');
    expect(args?.[3]).toHaveProperty('runInternalTermination');
    expect(args?.[3]).toHaveProperty('changeAgentRoleFromAdmin');
  });

  it('registers dashboard routes with the locally-created read model and stores', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerDashboardRoutes).toHaveBeenCalledTimes(1);
    expect(mocks.registerDashboardRoutes).toHaveBeenCalledWith({
      httpServer: ctx.httpServer,
      db: ctx.db,
      registry: stores.registry,
      finance: stores.finance,
      readModel: stores.readModel,
      systemRM: stores.systemRM,
    });
  });

  it('registers system read routes with all 9 system-related fields', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerSystemReadRoutes).toHaveBeenCalledTimes(1);
    const args = mocks.registerSystemReadRoutes.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      httpServer: ctx.httpServer,
      db: ctx.db,
      registry: stores.registry,
      workspaceBasePath: ctx.workspaceBasePath,
      capabilities: stores.capabilities,
      integrations: ctx.integrations,
      llmSettings: stores.llmSettings,
      llmModelPrices: stores.llmModelPrices,
      systemSettings: stores.systemSettings,
    });
    // readModel sub-shape: only getAgent + getApplicationMigrations
    expect(Object.keys(args.readModel).sort()).toEqual(
      ['getAgent', 'getApplicationMigrations'].sort(),
    );
    expect(args.readModel.getAgent).toBe(stores.readModel.getAgent);
    expect(args.readModel.getApplicationMigrations).toBe(
      stores.readModel.getApplicationMigrations,
    );
  });

  it('registers finance read routes with the locally-created companyCash', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerFinanceReadRoutes).toHaveBeenCalledTimes(1);
    expect(mocks.registerFinanceReadRoutes).toHaveBeenCalledWith(
      ctx.httpServer,
      ctx.db,
      { companyCash: stores.companyCash },
    );
  });

  it('registers fragmented agent detail routes (lines 219-230) with the right sub-args', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerAgentBaseRoutes).toHaveBeenCalledWith(
      ctx.httpServer,
      stores.readModel.getAgent,
    );
    expect(mocks.registerAgentReadRoutes).toHaveBeenCalledWith(
      ctx.httpServer,
      stores.readModel,
    );
    expect(mocks.registerAgentStepsRoutes).toHaveBeenCalledWith(ctx.httpServer, ctx.db);
    expect(mocks.registerAgentConversationsRoutes).toHaveBeenCalledWith(
      ctx.httpServer,
      stores.readModel.listAgentRecentConversations,
    );
    expect(mocks.registerAgentMemoryRoutes).toHaveBeenCalledWith(ctx.httpServer, {
      getAgentRuntimeMemory: stores.readModel.getAgentRuntimeMemory,
    });
    expect(mocks.registerAgentMetricsRoutes).toHaveBeenCalledWith(ctx.httpServer, ctx.db);
    expect(mocks.registerAgentContractRoutes).toHaveBeenCalledWith(ctx.httpServer, ctx.db);
    expect(mocks.registerAgentMcpRoutes).toHaveBeenCalledWith(ctx.httpServer, ctx.db);
    expect(mocks.registerAgentSchedulesRoutes).toHaveBeenCalledWith(ctx.httpServer, ctx.db);
    expect(mocks.registerAgentNotificationsRoutes).toHaveBeenCalledWith(ctx.httpServer, ctx.db);
  });

  it('registers agent provider MCP routes with the httpServer, db, and loaderConfig', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerAgentProviderMcpRoutes).toHaveBeenCalledTimes(1);
    expect(mocks.registerAgentProviderMcpRoutes).toHaveBeenCalledWith({
      httpServer: ctx.httpServer,
      db: ctx.db,
      loaderConfig: ctx.loaderConfig,
    });
  });

  it('registers system write routes with all 9 system-related fields + loadAgent', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerSystemWriteRoutes).toHaveBeenCalledTimes(1);
    const args = mocks.registerSystemWriteRoutes.mock.calls[0]?.[0];
    expect(args).toMatchObject({
      httpServer: ctx.httpServer,
      db: ctx.db,
      workspaceBasePath: ctx.workspaceBasePath,
      loaderConfig: ctx.loaderConfig,
      registry: stores.registry,
      systemSettings: stores.systemSettings,
      llmSettings: stores.llmSettings,
      llmModelPrices: stores.llmModelPrices,
      integrations: ctx.integrations,
    });
    expect(typeof args.loadAgent).toBe('function');
  });

  it('registers finance write routes with companyCash and companyPayables', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerFinanceWriteRoutes).toHaveBeenCalledTimes(1);
    expect(mocks.registerFinanceWriteRoutes).toHaveBeenCalledWith(ctx.httpServer, {
      companyCash: stores.companyCash,
      companyPayables: stores.companyPayables,
    });
  });

  it('registers internal chat routes with httpServer and internalChat service', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerInternalChatRoutes).toHaveBeenCalledTimes(1);
    expect(mocks.registerInternalChatRoutes).toHaveBeenCalledWith(
      ctx.httpServer,
      ctx.internalChat,
    );
  });

  it('registers admin webhooks with httpServer, db, and registry', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    expect(mocks.registerAdminWebhooks).toHaveBeenCalledTimes(1);
    expect(mocks.registerAdminWebhooks).toHaveBeenCalledWith({
      httpServer: ctx.httpServer,
      db: ctx.db,
      registry: stores.registry,
    });
  });

  it('calls every sub-register*Routes exactly once (L#NN-17 Class 1 tripwire)', () => {
    const ctx = makeContext();
    registerAdminRoutes(ctx);
    // L#NN-9 9b: if a register*Routes is silently dropped (e.g., L#NN-17 Class 1
    // bug), the corresponding mock would be 0 calls. This test would FAIL.
    const allMocks = Object.values(mocks);
    for (const m of allMocks) {
      expect(m).toHaveBeenCalledTimes(1);
    }
  });
});
