import { and, desc, eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------
// Stable mock references via vi.hoisted so they are initialized
// before vi.mock factories run.
// ---------------------------------------------------------------------
const mockForgeDebug = vi.hoisted(() => vi.fn());
const mockGetInternalAgentRegistry = vi.hoisted(() => vi.fn(() => ({ size: 0, get: vi.fn() })));
const mockReadLongTermMemoryState = vi.hoisted(() => vi.fn());
const mockReadLongTermMemoryRecallSnapshot = vi.hoisted(() => vi.fn());
const mockMigrateLegacyCheckpointedOmState = vi.hoisted(() => vi.fn());
const mockListRecentConversations = vi.hoisted(() => vi.fn());
const mockListThreadMessages = vi.hoisted(() => vi.fn());
const mockCloseLibsqlClient = vi.hoisted(() => vi.fn());
const mockWithTimeout = vi.hoisted(() => vi.fn((promise) => promise));
const mockReadOperationalMemoryState = vi.hoisted(() => vi.fn());
const mockListAgentWorkspaceSkills = vi.hoisted(() => vi.fn());
const mockLibsqlClientCreateClient = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------
// vi.mock blocks — hoisted by Vitest
// ---------------------------------------------------------------------
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
  toMastraSafeIdentifier: (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '_'),
  LibsqlConversationStore: vi.fn().mockImplementation(() => ({
    read: vi.fn().mockResolvedValue({ workingMemory: null }),
  })),
  readOperationalMemoryState: mockReadOperationalMemoryState,
}));



vi.mock('./conversation-helpers', () => ({
  closeLibsqlClient: mockCloseLibsqlClient,
  listRecentConversations: mockListRecentConversations,
  listThreadMessages: mockListThreadMessages,
  withTimeout: mockWithTimeout,
}));

vi.mock('../../agents/internal-agent-registry', () => ({
  getInternalAgentRegistry: mockGetInternalAgentRegistry,
}));

vi.mock('./helpers-ltm', () => ({
  readLongTermMemoryState: mockReadLongTermMemoryState,
  readLongTermMemoryRecallSnapshot: mockReadLongTermMemoryRecallSnapshot,
}));

vi.mock('../../agents/migrate-legacy-checkpointed-om', () => ({
  migrateLegacyCheckpointedOmState: mockMigrateLegacyCheckpointedOmState,
}));

vi.mock('../../agents/workspace-skills', () => ({
  listAgentWorkspaceSkills: mockListAgentWorkspaceSkills,
}));

vi.mock('@libsql/client', () => ({
  createClient: mockLibsqlClientCreateClient,
}));

// ---------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------
import { createAgentReadModel } from './agents';

// ---------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------
function makeMockDb(overrides = {}) {
  const db = {
    query: {
      agents: {
        findMany: vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      agentNotifications: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentExecutionContracts: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentRoles: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      llmProfiles: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentExecutionSteps: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentMcpConfigs: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      agentSchedules: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      mcpServerConfigs: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      agentHomeMetricSnapshots: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    }),
    ...overrides,
  };
  return db as ReturnType<typeof createAgentReadModel> extends Promise<infer R> ? never : Parameters<typeof createAgentReadModel>[0]['db'];
}

function makeMockFinance() {
  return {
    getCompanyCashBalance: vi.fn().mockResolvedValue({ balanceUsd: 1234.56 }),
    listCompanyCashMovements: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
  };
}

function makeMockInternalChat() {
  return {
    listAccounts: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue([]),
  };
}

function makeMockSystemSettings() {
  return {
    getSettings: vi.fn().mockResolvedValue({
      checkpointedOmRecentRawTokens: 10000,
      checkpointedOmRawObservationBatchTokens: 5000,
      checkpointedOmObservationReflectionBatchTokens: 5000,
      checkpointedOmTotalContextTokens: 200000,
    }),
  };
}

function makeReadModel(deps = {}) {
  return createAgentReadModel({
    db: makeMockDb(),
    finance: makeMockFinance(),
    internalChat: makeMockInternalChat(),
    workspaceBasePath: '/workspaces/forge',
    systemSettings: makeMockSystemSettings(),
    ...deps,
  });
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------
describe('createAgentReadModel', () => {
  beforeEach(() => {
    // Reset and re-configure per-test mocks
    mockReadOperationalMemoryState.mockReset();
    mockReadOperationalMemoryState.mockResolvedValue(null);
    mockListThreadMessages.mockReset();
    mockListThreadMessages.mockResolvedValue({ items: [], hasMore: false });
    mockReadLongTermMemoryState.mockReset();
    mockReadLongTermMemoryState.mockResolvedValue(null);
  });

  describe('getDashboard', () => {
    it('returns totals and cash data', async () => {
      const finance = makeMockFinance();
      const model = makeReadModel({ finance });
      const result = await model.getDashboard();
      expect(result).toHaveProperty('totals');
      expect(result).toHaveProperty('cash');
      expect(result.cash.balanceUsd).toBe(1234.56);
    });

    it('returns zero agents when db returns empty', async () => {
      const model = makeReadModel();
      const result = await model.getDashboard();
      expect(result.totals.agents).toBe(0);
      expect(result.totals.loadedAgents).toBe(0);
    });

    it('counts loaded agents from registry size', async () => {
      const registry = { size: 3, get: vi.fn() };
      mockGetInternalAgentRegistry.mockReturnValue(registry);
      const model = makeReadModel();
      const result = await model.getDashboard();
      expect(result.totals.loadedAgents).toBe(3);
    });
  });

  describe('listAgents', () => {
    it('returns empty array when no agents exist', async () => {
      const model = makeReadModel();
      const result = await model.listAgents();
      expect(result).toEqual([]);
    });

    it('maps agent roles from role map', async () => {
      const agentRow = {
        id: 'agent-1',
        name: 'Test Agent',
        role: 'role-1',
        executionState: 'idle' as const,
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        workspaceFilesystem: null,
      };
      const roleRow = { id: 'role-1', name: 'Developer', description: null, capabilities: null, createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' };
      const db = makeMockDb();
      db.query.agents.findMany.mockResolvedValue([agentRow]);
      db.query.agentRoles.findMany.mockResolvedValue([roleRow]);
      db.query.llmProfiles.findMany.mockResolvedValue([]);
      const model = makeReadModel({ db });
      const result = await model.listAgents();
      expect(result).toHaveLength(1);
      expect((result[0] as Record<string, unknown>).name).toBe('Test Agent');
    });

    it('handles absent execution state', async () => {
      const agentRow = {
        id: 'agent-2',
        name: null,
        role: null,
        executionState: 'absent' as const,
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        workspaceFilesystem: null,
      };
      const db = makeMockDb();
      db.query.agents.findMany.mockResolvedValue([agentRow]);
      db.query.agentRoles.findMany.mockResolvedValue([]);
      db.query.llmProfiles.findMany.mockResolvedValue([]);
      const model = makeReadModel({ db });
      const result = await model.listAgents();
      expect(result).toHaveLength(1);
      expect((result[0] as Record<string, unknown>).executionState).toBe('absent');
    });
  });

  describe('getAgent', () => {
    it('returns null when agent not found', async () => {
      const db = makeMockDb();
      db.query.agents.findFirst.mockResolvedValue(null);
      const model = makeReadModel({ db });
      const result = await model.getAgent('nonexistent');
      expect(result).toBeNull();
    });

    it('returns agent with recent execution steps', async () => {
      const agentRow = {
        id: 'agent-1',
        name: 'My Agent',
        role: 'dev',
        executionState: 'idle' as const,
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        workspaceFilesystem: null,
      };
      const stepRow = {
        id: 'step-1',
        agentId: 'agent-1',
        kind: 'agent-step',
        status: 'complete' as const,
        input: null,
        output: null,
        error: null,
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      };
      const db = makeMockDb();
      db.query.agents.findFirst.mockResolvedValue(agentRow);
      db.query.agentExecutionSteps.findMany.mockResolvedValue([stepRow]);
      db.query.agentRoles.findMany.mockResolvedValue([]);
      db.query.llmProfiles.findMany.mockResolvedValue([]);
      db.query.agentMcpConfigs.findMany.mockResolvedValue([]);
      db.query.agentSchedules.findMany.mockResolvedValue([]);
      db.query.mcpServerConfigs.findFirst.mockResolvedValue(null);
      mockListAgentWorkspaceSkills.mockResolvedValue([]);
      const model = makeReadModel({ db });
      const result = await model.getAgent('agent-1');
      expect(result).not.toBeNull();
      expect((result as Record<string, unknown>).id).toBe('agent-1');
    });

    it('maps lastExecutionError when present', async () => {
      const agentRow = {
        id: 'agent-3',
        name: 'Failing Agent',
        role: null,
        executionState: 'error' as const,
        lastExecutionError: 'Out of memory',
        lastExecutionErrorAt: '2024-01-03T12:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-03T12:00:00.000Z',
        workspaceFilesystem: null,
      };
      const db = makeMockDb();
      db.query.agents.findFirst.mockResolvedValue(agentRow);
      db.query.agentRoles.findMany.mockResolvedValue([]);
      db.query.llmProfiles.findMany.mockResolvedValue([]);
      db.query.agentExecutionSteps.findMany.mockResolvedValue([]);
      db.query.agentMcpConfigs.findMany.mockResolvedValue([]);
      db.query.agentSchedules.findMany.mockResolvedValue([]);
      db.query.mcpServerConfigs.findFirst.mockResolvedValue(null);
      mockListAgentWorkspaceSkills.mockResolvedValue([]);
      const model = makeReadModel({ db });
      const result = await model.getAgent('agent-3');
      expect((result as Record<string, unknown>).lastExecutionError).toBe('Out of memory');
    });
  });

  describe('listAgentRecentConversations', () => {
    it('returns empty when agent not found', async () => {
      const db = makeMockDb();
      db.query.agents.findFirst.mockResolvedValue(null);
      const model = makeReadModel({ db });
      const result = await model.listAgentRecentConversations('ghost-agent');
      expect(result).toEqual([]);
    });

    it('returns conversations from conversation helper', async () => {
      const agentRow = { id: 'agent-1', name: 'A', role: null, executionState: 'absent' as const, lastExecutionError: null, lastExecutionErrorAt: null, createdAt: '', updatedAt: '', workspaceFilesystem: null };
      const db = makeMockDb();
      db.query.agents.findFirst.mockResolvedValue(agentRow);
      mockListRecentConversations.mockResolvedValue([{ id: 'conv-1' }]);
      const model = makeReadModel({ db });
      const result = await model.listAgentRecentConversations('agent-1');
      expect(result).toHaveLength(1);
    });
  });

  describe('listAgentExecutionSteps', () => {
    it('returns steps in descending order', async () => {
      const stepRows = [
        { id: 's2', agentId: 'a1', kind: 'step', status: 'ok' as const, input: null, output: null, error: null, createdAt: '2024-01-02', updatedAt: '2024-01-02' },
        { id: 's1', agentId: 'a1', kind: 'step', status: 'ok' as const, input: null, output: null, error: null, createdAt: '2024-01-01', updatedAt: '2024-01-01' },
      ];
      const db = makeMockDb();
      db.query.agentExecutionSteps.findMany.mockResolvedValue(stepRows);
      const model = makeReadModel({ db });
      const result = await model.listAgentExecutionSteps({ agentId: 'a1', limit: 20, offset: 0 });
      expect(result).toHaveLength(2);
    });

    it('respects limit and offset', async () => {
      const db = makeMockDb();
      db.query.agentExecutionSteps.findMany.mockResolvedValue([]);
      const model = makeReadModel({ db });
      await model.listAgentExecutionSteps({ agentId: 'a1', limit: 5, offset: 10 });
      expect(db.query.agentExecutionSteps.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 5, offset: 10 }),
      );
    });
  });

  describe('listAgentThreadMessages', () => {
    it('delegates to listThreadMessages', async () => {
      mockListThreadMessages.mockResolvedValue({ items: [{ id: 'm1' }], hasMore: false });
      const model = makeReadModel();
      const result = await model.listAgentThreadMessages({ agentId: 'a1', page: 0, perPage: 20 });
      expect(mockListThreadMessages).toHaveBeenCalled();
      expect(result).toEqual({ items: [{ id: 'm1' }], hasMore: false });
    });
  });

  describe('listAgentLongTermMemoryThreadMessages', () => {
    it('passes long_term_memory threadId to listThreadMessages', async () => {
      mockListThreadMessages.mockResolvedValue({ items: [], hasMore: false });
      const model = makeReadModel();
      await model.listAgentLongTermMemoryThreadMessages({ agentId: 'my-agent', page: 0, perPage: 20 });
      const call = mockListThreadMessages.mock.calls[0];
      expect(call[2].threadId).toBe('my_agent_long_term_memory');
    });
  });

  describe('listRecentAgentHomeMetricSnapshots', () => {
    it('returns mapped snapshot rows', async () => {
      const snapshotRows = [
        { id: 'snap-1', agentId: 'a1', stepId: 'step-1', stepCreatedAt: '2024-01-01', createdAt: '2024-01-01', snapshot: { foo: 'bar' } },
      ];
      const db = makeMockDb();
      db.query.agentHomeMetricSnapshots.findMany.mockResolvedValue(snapshotRows);
      const model = makeReadModel({ db });
      const result = await model.listRecentAgentHomeMetricSnapshots({ agentId: 'a1', limit: 10 });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('snap-1');
      expect(result[0].snapshot).toEqual({ foo: 'bar' });
    });

    it('returns empty when no snapshots exist', async () => {
      const db = makeMockDb();
      db.query.agentHomeMetricSnapshots.findMany.mockResolvedValue([]);
      const model = makeReadModel({ db });
      const result = await model.listRecentAgentHomeMetricSnapshots({ agentId: 'a1', limit: 5 });
      expect(result).toEqual([]);
    });
  });

  describe('getAgentOmDebugExport', () => {
    it('returns null when agent not found', async () => {
      const db = makeMockDb();
      db.query.agents.findFirst.mockResolvedValue(null);
      const model = makeReadModel({ db });
      const result = await model.getAgentOmDebugExport('ghost');
      expect(result).toBeNull();
    });

    it('returns agent, runtimeMemory, and snapshots', async () => {
      mockLibsqlClientCreateClient.mockReturnValue({ close: vi.fn() });
      const { LibsqlConversationStore } = await import('@forge-runtime/core');
      const realCtor = (LibsqlConversationStore as any).getMockImplementation();
      (LibsqlConversationStore as any).mockImplementation(function() { return { read: vi.fn().mockResolvedValue({ workingMemory: null }) }; });

      const agentRow = { id: 'agent-1', name: 'A', role: null, executionState: 'absent' as const, lastExecutionError: null, lastExecutionErrorAt: null, createdAt: '', updatedAt: '', workspaceFilesystem: null };
      const db = makeMockDb();
      db.query.agents.findFirst.mockResolvedValue(agentRow);
      db.query.agentRoles.findMany.mockResolvedValue([]);
      db.query.llmProfiles.findMany.mockResolvedValue([]);
      db.query.agentExecutionSteps.findMany.mockResolvedValue([]);
      db.query.agentMcpConfigs.findMany.mockResolvedValue([]);
      db.query.agentSchedules.findMany.mockResolvedValue([]);
      db.query.mcpServerConfigs.findFirst.mockResolvedValue(null);
      db.query.agentHomeMetricSnapshots.findMany.mockResolvedValue([]);
      mockListAgentWorkspaceSkills.mockResolvedValue([]);
      // Mock the runtime memory read by overriding withTimeout behavior
      const { readOperationalMemoryState } = await import('@forge-runtime/core');
      (readOperationalMemoryState as ReturnType<typeof vi.fn>).mockResolvedValue({
        checkpointSummaryMessage: null,
        reflectionMessages: [],
        observationMessages: [],
        metrics: {
          rawMessageCount: 0,
          recentRawMessageCount: 0,
          recentRawTokenCount: 0,
          overflowMessageCount: 0,
          overflowTokenCount: 0,
          observationTokenCount: 0,
          reflectionTokenCount: 0,
          checkpointTokenCount: 0,
          latestThreadMessageAt: null,
        },
      });
      mockReadLongTermMemoryRecallSnapshot.mockResolvedValue(null);
      const model = makeReadModel({ db });
      const result = await model.getAgentOmDebugExport('agent-1');
      expect(result).not.toBeNull();
      expect(result!.agent).toBeDefined();
    });
  });

  describe('listAgentConversationMessages — internal-chat provider', () => {
    it('maps authorAgentId from account registry', async () => {
      const account = { id: 'acc-1', agentId: 'agent-1', provider: 'internal-chat' as const };
      const msg = { id: 'msg-1', authorId: 'acc-1', content: 'hello', role: 'user' as const, createdAt: '2024-01-01' };
      const ic = {
        listAccounts: vi.fn().mockResolvedValue([account]),
        getMessages: vi.fn().mockResolvedValue([msg]),
      };
      const model = makeReadModel({ internalChat: ic });
      const result = await model.listAgentConversationMessages({
        agentId: 'agent-1',
        provider: 'internal-chat',
        targetKey: 'conv-key',
        limit: 50,
        offset: 0,
      });
      expect(result.items[0].authorAgentId).toBe('agent-1');
    });

    it('returns empty when provider is unknown and agent not in registry', async () => {
      mockGetInternalAgentRegistry.mockReturnValue({ size: 0, get: vi.fn().mockReturnValue(null) });
      const model = makeReadModel();
      const result = await model.listAgentConversationMessages({
        agentId: 'agent-1',
        provider: 'unknown',
        targetKey: 'key',
        limit: 10,
        offset: 0,
      });
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });
});
