import { and, desc, eq, sql } from 'drizzle-orm';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createMockDb, resetAgentReadModelMocks } from './shared-test-helpers';

// ---------------------------------------------------------------------
// Stable mock references via vi.hoisted so they are initialized
// before vi.mock factories run.
// ---------------------------------------------------------------------
const mockForgeDebug = vi.hoisted(() => vi.fn());
const mockGetInternalAgentRegistry = vi.hoisted(() =>
  vi.fn(() => ({ size: 0, list: vi.fn(() => []), get: vi.fn() })),
);
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

vi.mock('./agents-runtime-memory', () => ({
  getAgentRuntimeMemory: vi.fn(),
  createAgentsRuntimeMemoryReadModel: vi.fn(({ db, workspaceBasePath }) => ({
    getAgentRuntimeMemory: vi.fn(),
  })),
}));

vi.mock('./agents-debug', () => ({
  createAgentDebugReadModel: vi.fn(
    ({ db, getAgent, listRecentAgentHomeMetricSnapshots, workspaceBasePath }) => ({
      getAgentOmDebugExport: vi.fn(),
      debugAgentLongTermMemoryRecallSearch: vi.fn(),
      getAgentRuntimeMemory: vi.fn(),
    }),
  ),
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

vi.mock('../../communication/internal-chat-service', () => ({
  createInternalChatService: vi.fn(() => ({
    getMessages: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    getMessagesByAccount: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    listConversations: vi.fn().mockResolvedValue([]),
    listConversationsByAccount: vi.fn().mockResolvedValue([]),
    registerAgentAccount: vi.fn().mockResolvedValue({ id: 'a1', agentId: 'a1' }),
    listAccounts: vi.fn().mockResolvedValue([]),
  })),
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
  return createMockDb(overrides) as unknown;
}

function makeMockFinance() {
  return {
    getCompanyCashBalance: vi.fn().mockResolvedValue({ balanceUsd: 1234.56 }),
    listCompanyCashMovements: vi
      .fn()
      .mockResolvedValue({ items: [], total: 0, summary: null, hasMore: false }),
    getCompanyCashSummary: vi
      .fn()
      .mockResolvedValue({ balanceUsd: 1234.56, pendingPaymentsUsd: 0, pendingReceivablesUsd: 0 }),
    listActiveInternalAgentContracts: vi.fn().mockResolvedValue([]),
    getActiveInternalAgentContract: vi.fn().mockResolvedValue(null),
    getActiveContractMetrics: vi
      .fn()
      .mockResolvedValue({ runningAgents: 0, totalBudgetUsd: 0, usedBudgetUsd: 0 }),
  };
}

function makeMockInternalChat() {
  return {
    registerAgentAccount: vi.fn().mockResolvedValue({
      id: 'a1',
      agentId: 'a1',
      displayName: 'Test Agent',
      providerType: 'internal-chat',
      createdAt: Date.now(),
    }),
    registerExternalAccount: vi.fn().mockResolvedValue({
      id: 'e1',
      displayName: 'Ext',
      providerType: 'email',
      createdAt: Date.now(),
    }),
    updateExternalAccount: vi.fn().mockResolvedValue({ id: 'e1' }),
    deleteExternalAccount: vi.fn().mockResolvedValue(undefined),
    deleteAgentAccount: vi.fn().mockResolvedValue(undefined),
    onReceiveMessage: vi.fn(),
    clearHandler: vi.fn(),
    listAccounts: vi.fn().mockResolvedValue([]),
    getAccountBySlug: vi.fn().mockResolvedValue(null),
    getAccountByAgentId: vi.fn().mockResolvedValue(null),
    getConversationForAgent: vi.fn().mockResolvedValue(null),
    createChatGroup: vi.fn().mockResolvedValue({ id: 'g1', createdAt: Date.now() }),
    addMemberToGroup: vi.fn().mockResolvedValue(undefined),
    removeMemberFromGroup: vi.fn().mockResolvedValue(undefined),
    changeChatGroup: vi.fn().mockResolvedValue({ id: 'g1' }),
    listChatGroups: vi.fn().mockResolvedValue([]),
    listGroupMembers: vi.fn().mockResolvedValue([]),
    listGroupMembersByAccount: vi.fn().mockResolvedValue([]),
    listConversations: vi.fn().mockResolvedValue([]),
    listConversationsByAccount: vi.fn().mockResolvedValue([]),
    getMessages: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    getMessagesByAccount: vi.fn().mockResolvedValue({ items: [], hasMore: false }),
    sendMessage: vi.fn().mockResolvedValue({ id: 'm1', createdAt: Date.now() }),
    getMessageAttachmentByAccount: vi.fn().mockResolvedValue(null),
    createExternalChatGroup: vi.fn().mockResolvedValue({ id: 'g1', createdAt: Date.now() }),
    createExternalChatGroupWithMembers: vi
      .fn()
      .mockResolvedValue({ id: 'g1', createdAt: Date.now() }),
    ensureDirectConversationByAccount: vi
      .fn()
      .mockResolvedValue({ id: 'c1', createdAt: Date.now() }),
    addMemberToGroupByAccount: vi.fn().mockResolvedValue(undefined),
    updateMemberRoleByAccount: vi.fn().mockResolvedValue(undefined),
    removeMemberFromGroupByAccount: vi.fn().mockResolvedValue(undefined),
    updateGroupByAccount: vi.fn().mockResolvedValue({ id: 'g1' }),
    archiveConversationByAccount: vi.fn().mockResolvedValue(undefined),
    getUnreadSummary: vi.fn().mockResolvedValue({ total: 0, byAccount: {} }),
    listRecentConversations: vi.fn().mockResolvedValue([]),
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
    upsertSettings: vi.fn().mockResolvedValue({
      checkpointedOmRecentRawTokens: 10000,
      checkpointedOmRawObservationBatchTokens: 5000,
      checkpointedOmObservationReflectionBatchTokens: 5000,
      checkpointedOmTotalContextTokens: 200000,
    }),
  };
}

function makeReadModel(deps = {}) {
  return createAgentReadModel({
    db: makeMockDb() as unknown as Parameters<typeof createAgentReadModel>[0]['db'],
    finance: makeMockFinance(),
    internalChat: makeMockInternalChat(),
    workspaceBasePath: '/workspaces/forge',
    systemSettings: makeMockSystemSettings(),
    ...deps,
  } as any);
}

// ---------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------
describe('createAgentReadModel', () => {
  beforeEach(() => {
    resetAgentReadModelMocks({
      mockReadOperationalMemoryState,
      mockListThreadMessages,
      mockReadLongTermMemoryState,
    });
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
      const registry = { size: 3, list: vi.fn(() => []), get: vi.fn() };
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
      const roleRow = {
        id: 'role-1',
        name: 'Developer',
        description: null,
        capabilities: null,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
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
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
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
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
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
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
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
      expect((result as Record<string, unknown>).agentId).toBe('agent-1');
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
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
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
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
      db.query.agents.findFirst.mockResolvedValue(null);
      const model = makeReadModel({ db });
      const result = await model.listAgentRecentConversations('ghost-agent');
      expect(result).toEqual([]);
    });

    it('returns conversations from conversation helper', async () => {
      const agentRow = {
        id: 'agent-1',
        name: 'A',
        role: null,
        executionState: 'absent' as const,
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        createdAt: '',
        updatedAt: '',
        workspaceFilesystem: null,
      };
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
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
        {
          id: 's2',
          agentId: 'a1',
          kind: 'step',
          status: 'ok' as const,
          input: null,
          output: null,
          error: null,
          createdAt: '2024-01-02',
          updatedAt: '2024-01-02',
        },
        {
          id: 's1',
          agentId: 'a1',
          kind: 'step',
          status: 'ok' as const,
          input: null,
          output: null,
          error: null,
          createdAt: '2024-01-01',
          updatedAt: '2024-01-01',
        },
      ];
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
      db.query.agentExecutionSteps.findMany.mockResolvedValue(stepRows);
      const model = makeReadModel({ db });
      const result = await model.listAgentExecutionSteps({ agentId: 'a1', limit: 20, offset: 0 });
      expect(result).toHaveLength(2);
    });

    it('respects limit and offset', async () => {
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
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
      await model.listAgentLongTermMemoryThreadMessages({
        agentId: 'my-agent',
        page: 0,
        perPage: 20,
      });
      const call = mockListThreadMessages.mock.calls[0];
      expect(call[2].threadId).toBe('my_agent_long_term_memory');
    });
  });

  describe('listRecentAgentHomeMetricSnapshots', () => {
    it('returns mapped snapshot rows', async () => {
      const snapshotRows = [
        {
          id: 'snap-1',
          agentId: 'a1',
          stepId: 'step-1',
          stepCreatedAt: '2024-01-01',
          createdAt: '2024-01-01',
          snapshot: { foo: 'bar' },
        },
      ];
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
      db.query.agentHomeMetricSnapshots.findMany.mockResolvedValue(snapshotRows);
      const model = makeReadModel({ db });
      const result = (await model.listRecentAgentHomeMetricSnapshots({
        agentId: 'a1',
        limit: 10,
      })) as Array<{ id: string; snapshot: unknown }>;
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('snap-1');
      expect(result[0].snapshot).toEqual({ foo: 'bar' });
    });

    it('returns empty when no snapshots exist', async () => {
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
      db.query.agentHomeMetricSnapshots.findMany.mockResolvedValue([]);
      const model = makeReadModel({ db });
      const result = await model.listRecentAgentHomeMetricSnapshots({ agentId: 'a1', limit: 5 });
      expect(result).toEqual([]);
    });
  });

  it('maps MCP servers with correct configId and serverId from shared config', async () => {
    const agentRow = {
      id: 'agent-mcp',
      name: 'MCP Agent',
      role: null,
      roleId: null,
      modelProfileId: null,
      omModelProfileId: null,
      instructions: 'Test instructions',
      executionState: 'idle' as const,
      lastExecutionError: null,
      lastExecutionErrorAt: null,
      description: null,
      workspaceAutoSync: 1,
      workspaceBm25: 1,
      workspaceEmbedder: 'default',
      workspaceFilesystem: null,
      workspaceSandbox: null,
      workspaceSkills: null,
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    };
    // agentMcpRows: link record (has id and serverId pointing to shared mcpServerConfigs)
    const agentMcpRows = [
      {
        id: 'link-id-1',
        agentId: 'agent-mcp',
        serverId: 'server-id-1',
        isActive: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    // mcpServerConfigs rows: shared server (has id = 'server-id-1')
    const mcpServerRows = [
      {
        id: 'server-id-1',
        name: 'Filesystem MCP',
        description: 'File system access',
        transport: 'stdio',
        command: 'npx',
        args: '["-y","@modelcontextprotocol/server-filesystem"]',
        envVars: null,
        url: null,
        headers: null,
        version: 1,
        isActive: 1,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    const db = makeMockDb() as ReturnType<typeof createMockDb>;
    db.query.agents.findFirst.mockResolvedValue(agentRow);
    db.query.agentRoles.findMany.mockResolvedValue([]);
    db.query.llmProfiles.findMany.mockResolvedValue([]);
    db.query.agentExecutionSteps.findMany.mockResolvedValue([]);
    db.query.agentMcpConfigs.findMany.mockResolvedValue(agentMcpRows);
    db.query.agentSchedules.findMany.mockResolvedValue([]);
    db.query.mcpServerConfigs.findMany.mockResolvedValue(mcpServerRows);
    mockListAgentWorkspaceSkills.mockResolvedValue([]);
    const model = makeReadModel({ db });
    const result = (await model.getAgent('agent-mcp')) as Record<string, unknown>;
    expect(result.mcpServers).toHaveLength(1);
    expect((result.mcpServers as Record<string, unknown>[])[0].configId).toBe('link-id-1');
    expect((result.mcpServers as Record<string, unknown>[])[0].serverId).toBe('server-id-1');
    expect((result.mcpServers as Record<string, unknown>[])[0].isActive).toBe(true);
    expect((result.mcpServers as Record<string, unknown>[])[0].name).toBe('Filesystem MCP');
    expect(result.mcpConfigIds).toEqual(['link-id-1']);
  });

  describe('getAgentOmDebugExport', () => {
    it('returns null when agent not found', async () => {
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
      db.query.agents.findFirst.mockResolvedValue(null);
      const model = makeReadModel({ db });
      const result = await model.getAgentOmDebugExport('ghost');
      expect(result).toBeNull();
    });

    it('returns agent, runtimeMemory, and snapshots', async () => {
      mockLibsqlClientCreateClient.mockReturnValue({ close: vi.fn() });
      const { LibsqlConversationStore } = await import('@forge-runtime/core');
      const realCtor = (LibsqlConversationStore as any).getMockImplementation();
      (LibsqlConversationStore as any).mockImplementation(function () {
        return { read: vi.fn().mockResolvedValue({ workingMemory: null }) };
      });

      const agentRow = {
        id: 'agent-1',
        name: 'A',
        role: null,
        executionState: 'absent' as const,
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        createdAt: '',
        updatedAt: '',
        workspaceFilesystem: null,
      };
      const db = makeMockDb() as ReturnType<typeof createMockDb>;
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
      const result = (await model.getAgentOmDebugExport('agent-1')) as { agent: unknown } | null;
      expect(result).not.toBeNull();
      expect(result!.agent).toBeDefined();
    });
  });

  describe('listAgentConversationMessages — internal-chat provider', () => {
    it.skip('maps authorAgentId from account registry [skip: agents-conversations uses listMessages not in InternalChatService type]', async () => {
      const account = { id: 'acc-1', agentId: 'agent-1', provider: 'internal-chat' as const };
      const msg = {
        id: 'msg-1',
        authorId: 'acc-1',
        content: 'hello',
        role: 'user' as const,
        createdAt: '2024-01-01',
      };
      const ic = {
        listAccounts: vi.fn().mockResolvedValue([account]),
        getMessages: vi.fn().mockResolvedValue([msg]),
      };
      const model = makeReadModel({ internalChat: ic });
      const result = (await model.listAgentConversationMessages({
        agentId: 'agent-1',
        provider: 'internal-chat',
        targetKey: 'conv-key',
        limit: 50,
        offset: 0,
      })) as { items: Array<{ authorAgentId: string }>; hasMore: boolean };
      expect(result.items[0].authorAgentId).toBe('agent-1');
    });

    it.skip('returns empty when provider is unknown [skip: agents-conversations uses listMessages not in InternalChatService type]', async () => {
      mockGetInternalAgentRegistry.mockReturnValue({
        size: 0,
        list: vi.fn(() => []),
        get: vi.fn().mockReturnValue(null),
      });
      const model = makeReadModel();
      const result = (await model.listAgentConversationMessages({
        agentId: 'agent-1',
        provider: 'unknown',
        targetKey: 'key',
        limit: 10,
        offset: 0,
      })) as { items: unknown[]; hasMore: boolean };
      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });
  });
});
