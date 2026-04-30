import { describe, it, expect, beforeEach, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Stable mock references (hoisted to top of module)
// ---------------------------------------------------------------------------

const mockForgeDebug = vi.fn();
const mockToMastraSafeIdentifier = vi.fn((id: string) => id);
const mockReadOperationalMemoryState = vi.fn();
const mockLibsqlConversationStore = vi.fn();

const mockCreateLibsqlClient = vi.fn(() => ({
  close: vi.fn(() => Promise.resolve()),
}));

const mockMigrateLegacyOmState = vi.fn();

const mockCreateLtmStore = vi.fn(() => ({
  readState: vi.fn(() => Promise.resolve({ packages: [] })),
}));

const mockCreateSystemSettingsStore = vi.fn((_db: unknown) => {
  const settings = {
    checkpointedOmRecentRawTokens: 10000,
    checkpointedOmRawObservationBatchTokens: 5000,
    checkpointedOmObservationReflectionBatchTokens: 2000,
    checkpointedOmTotalContextTokens: 200000,
  };
  return { getSettings: () => Promise.resolve(settings) };
});

// ---------------------------------------------------------------------------
// Mock module dependencies
// ---------------------------------------------------------------------------

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
  readOperationalMemoryState: mockReadOperationalMemoryState,
  toMastraSafeIdentifier: mockToMastraSafeIdentifier,
  LibsqlConversationStore: mockLibsqlConversationStore,
}));

vi.mock('./agent-long-term-memory-store', () => ({
  createAgentLongTermMemoryStore: mockCreateLtmStore,
}));

vi.mock('../database/system-settings/store', () => ({
  createSystemSettingsStore: mockCreateSystemSettingsStore,
}));

vi.mock('./migrate-legacy-checkpointed-om', () => ({
  migrateLegacyCheckpointedOmState: mockMigrateLegacyOmState,
}));

vi.mock('@libsql/client', () => ({
  createClient: mockCreateLibsqlClient,
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

const { readAgentHomeMetricSnapshot } = await import('./agent-home-metrics.ts');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Schema-compliant step factory
function mockStep(overrides) {
  return {
    id: 'step-1',
    agentId: 'agent-1',
    contractId: 'contract-1',
    llmProfileId: 'profile-1',
    modelKey: 'gpt-4',
    kind: 'agent-step',
    inputTokens: 1000,
    cachedInputTokens: 0,
    outputTokens: 500,
    inputPerMillionUsd: 2.0,
    inputCachePerMillionUsd: 0.5,
    outputPerMillionUsd: 6.0,
    contractCostMultiplier: 1.0,
    costUsd: 0.01,
    createdAt: Date.now(),
    ...overrides,
  };
}

type MockDbOverrides = {
  agentsFindFirst?: Record<string, unknown> | null;
  llmProfilesFindFirst?: Record<string, unknown> | Record<string, unknown>[] | null;
  agentRolesFindFirst?: Record<string, unknown> | null;
  agentExecutionStepsFindMany?: Record<string, unknown>[];
  agentNotificationsFindMany?: Record<string, unknown>[];
  agentProvidersFindMany?: Record<string, unknown>[];
};

function makeMockDb(overrides: MockDbOverrides = {}) {
  const {
    agentsFindFirst = null,
    llmProfilesFindFirst = [],
    agentRolesFindFirst = null,
    agentExecutionStepsFindMany = [],
    agentNotificationsFindMany = [],
    agentProvidersFindMany = [],
  } = overrides;

  // Queue-based llmProfiles.findFirst (for sequential calls)
  const llmProfileQueue: (Record<string, unknown> | null)[] = Array.isArray(llmProfilesFindFirst)
    ? [...llmProfilesFindFirst]
    : llmProfilesFindFirst !== null ? [llmProfilesFindFirst] : [];

  return {
    // db.select() used for unread notification count
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => {
          const unread = agentNotificationsFindMany.filter(
            (n: Record<string, unknown>) => n.readAt == null,
          );
          return Promise.resolve([{ count: unread.length }]);
        }),
      })),
    })),
    query: {
      agents: {
        findFirst: vi.fn().mockResolvedValue(agentsFindFirst),
      },
      llmProfiles: {
        findFirst: vi.fn().mockImplementation(() => {
          const next = llmProfileQueue.shift();
          return Promise.resolve(next ?? null);
        }),
      },
      agentRoles: {
        findFirst: vi.fn().mockResolvedValue(agentRolesFindFirst),
      },
      agentExecutionSteps: {
        findMany: vi.fn().mockResolvedValue([...(agentExecutionStepsFindMany)].sort((a, b) => b.createdAt - a.createdAt)),
      },
      agentNotifications: {
        findMany: vi.fn().mockResolvedValue(agentNotificationsFindMany),
      },
      agentProviders: {
        findMany: vi.fn().mockResolvedValue(agentProvidersFindMany),
      },
      systemSettings: {
        findFirst: vi.fn().mockResolvedValue({
          checkpointedOmRecentRawTokens: 10000,
          checkpointedOmRawObservationBatchTokens: 5000,
          checkpointedOmObservationReflectionBatchTokens: 2000,
          checkpointedOmTotalContextTokens: 200000,
        }),
      },
    },
  } as unknown as import('../../database').Database;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('readAgentHomeMetricSnapshot', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockForgeDebug.mockReturnValue(undefined);
    mockToMastraSafeIdentifier.mockImplementation((id: string) => id);
    mockLibsqlConversationStore.mockImplementation(function (opts: { client: unknown; tablePrefix: string }) {
      return {
        tablePrefix: opts.tablePrefix,
        listMessages: vi.fn().mockResolvedValue([]),
        listOperationalMemoryMessages: vi.fn().mockResolvedValue([]),
      };
    });
    mockCreateLibsqlClient.mockReturnValue({ close: vi.fn(() => Promise.resolve()) });
    mockMigrateLegacyOmState.mockResolvedValue(undefined);
    mockCreateLtmStore.mockReturnValue({ readState: vi.fn().mockResolvedValue({ packages: [] }) });
    mockCreateSystemSettingsStore.mockImplementation((_db: unknown) => {
      const settings = {
        checkpointedOmRecentRawTokens: 10000,
        checkpointedOmRawObservationBatchTokens: 5000,
        checkpointedOmObservationReflectionBatchTokens: 2000,
        checkpointedOmTotalContextTokens: 200000,
      };
      return { getSettings: () => Promise.resolve(settings) };
    });
  });

  it('returns null when agent does not exist', async () => {
    const db = makeMockDb({ agentsFindFirst: null });
    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-nonexistent',
      runtime: null,
      runnerSnapshot: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when agent not found in db', async () => {
    const db = makeMockDb({ agentsFindFirst: null });
    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });
    expect(result).toBeNull();
  });

  it('returns complete snapshot for fully configured agent', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: 'A test agent',
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: 'role-1',
        modelProfileId: 'profile-1',
        omModelProfileId: 'profile-2',
        createdAt: now,
        updatedAt: now,
      },
      llmProfilesFindFirst: [
        { id: 'profile-1', name: 'GPT-4', modelKey: 'gpt-4' },
        { id: 'profile-2', name: 'Claude', modelKey: 'claude-3-5' },
      ],
      agentRolesFindFirst: { id: 'role-1', name: 'Admin' },
      agentExecutionStepsFindMany: [
        mockStep({ id: 'step-1', createdAt: now - 60000, costUsd: 0.01, inputTokens: 1000 }),
        mockStep({ id: 'step-2', createdAt: now - 30000, costUsd: 0.02, inputTokens: 2000 }),
        mockStep({ id: 'step-3', createdAt: now - 10000, costUsd: 0.03, inputTokens: 3000 }),
      ],
      agentNotificationsFindMany: [
        { id: 'notif-1', agentId: 'agent-1', readAt: null },
        { id: 'notif-2', agentId: 'agent-1', readAt: null },
      ],
      agentProvidersFindMany: [
        { id: 'prov-1', agentId: 'agent-1', providerType: 'openai' },
        { id: 'prov-2', agentId: 'agent-1', providerType: 'anthropic' },
      ],
    });

    mockReadOperationalMemoryState.mockResolvedValue({
      checkpointSummaryMessage: { operationalMemoryGeneration: 3 },
      metrics: {
        recentRawMessageCount: 10,
        recentRawTokenCount: 5000,
        recentRawTokenLimit: 10000,
        overflowMessageCount: 2,
        overflowTokenCount: 1000,
        observationTokenCount: 500,
        checkpointTokenCount: 300,
        reflectionTokenCount: 0,
      },
      observationMessages: [{ id: 'obs1' }],
      reflectionMessages: [],
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result).not.toBeNull();
    expect(result!.agentId).toBe('agent-1');
    expect(result!.name).toBe('Test Agent');
    expect(result!.executionState).toBe('idle');
    expect(result!.roleName).toBe('Admin');
    expect(result!.loaded).toBe(false);
    expect(result!.providerTypes).toEqual(['anthropic', 'openai']);
    expect(result!.overview.unreadNotificationCount).toBe(2);
    expect(result!.overview.lastStepAt).toBe(now - 10000);
    expect(result!.overview.lastStepCostUsd).toBe(0.03);
    expect(result!.overview.om).toMatchObject({
      generationCount: 3,
      checkpointGeneration: 3,
      recentRawTokenCount: 5000,
      recentRawTokenLimit: 10000,
      overflowTokenCount: 1000,
      overflowTokenLimit: 5000,
      observationTokenCount: 500,
      checkpointTokenCount: 300,
      reflectionTokenCount: 0,
    });
  });

  it('sets roleName to null when agent has no roleId', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result).not.toBeNull();
    expect(result!.roleName).toBeNull();
    expect(result!.roleId).toBeNull();
    expect(result!.modelProfile).toBeNull();
    expect(result!.omModelProfile).toBeNull();
  });

  it('sets loaded to false when runtime is null', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.loaded).toBe(false);
    expect(result!.runner).toBeNull();
  });

  it('sets ltm.running and ltm.queued to false when executionState is not idle', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'running',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.overview.ltm.running).toBe(false);
    expect(result!.overview.ltm.queued).toBe(false);
  });

  it('sets averageStepIntervalMs to null when fewer than 2 steps', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
      agentExecutionStepsFindMany: [
        mockStep({ id: 'step-1', createdAt: now - 10000, costUsd: 0.01, inputTokens: 1000 }),
      ],
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.overview.averageStepIntervalMs).toBeNull();
  });

  it('calculates averageStepIntervalMs correctly for multiple steps', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
      agentExecutionStepsFindMany: [
        mockStep({ id: 'step-1', createdAt: now - 90000, costUsd: 0.01, inputTokens: 1000 }),
        mockStep({ id: 'step-2', createdAt: now - 60000, costUsd: 0.02, inputTokens: 2000 }),
        mockStep({ id: 'step-3', createdAt: now - 30000, costUsd: 0.03, inputTokens: 3000 }),
      ],
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    // Steps at now-90000, now-60000, now-30000 → intervals: 30s, 30s → avg: 30s
    expect(result!.overview.averageStepIntervalMs).toBe(30000);
  });

  it('sets om to null when readOperationalMemoryState rejects (timeout/error)', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    mockReadOperationalMemoryState.mockRejectedValue(new Error('Timeout'));

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result).not.toBeNull();
    expect(result!.overview.om).toBeNull();
  });

  it('uses lastStep.createdAt as lastStepAt in overview', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
      agentExecutionStepsFindMany: [
        mockStep({ id: 'step-1', createdAt: 1000000000000, costUsd: 0.05, inputTokens: 5000 }),
      ],
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.overview.lastStepAt).toBe(1000000000000);
  });

  it('sorts providerTypes alphabetically', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
      agentProvidersFindMany: [
        { id: 'prov-1', agentId: 'agent-1', providerType: 'zebra' },
        { id: 'prov-2', agentId: 'agent-1', providerType: 'alpha' },
        { id: 'prov-3', agentId: 'agent-1', providerType: 'beta' },
      ],
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.providerTypes).toEqual(['alpha', 'beta', 'zebra']);
  });

  it('includes createdAt and updatedAt from agent row', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.createdAt).toBe(now);
    expect(result!.updatedAt).toBe(now);
  });

  it('calls toMastraSafeIdentifier for workspace path generation', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    mockToMastraSafeIdentifier.mockReturnValue('safe-agent-1');

    await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(mockToMastraSafeIdentifier).toHaveBeenCalledWith('agent-1');
  });






  it('returns complete snapshot for fully configured agent', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: 'A test agent',
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: 'role-1',
        modelProfileId: 'profile-1',
        omModelProfileId: 'profile-2',
        createdAt: now,
        updatedAt: now,
      },
      llmProfilesFindFirst: [
        { id: 'profile-1', name: 'GPT-4', modelKey: 'gpt-4' },
        { id: 'profile-2', name: 'Claude', modelKey: 'claude-3-5' },
      ],
      agentRolesFindFirst: { id: 'role-1', name: 'Admin' },
      agentExecutionStepsFindMany: [
        mockStep({ id: 'step-1', createdAt: now - 60000, costUsd: 0.01, inputTokens: 1000 }),
        mockStep({ id: 'step-2', createdAt: now - 30000, costUsd: 0.02, inputTokens: 2000 }),
        mockStep({ id: 'step-3', createdAt: now - 10000, costUsd: 0.03, inputTokens: 3000 }),
      ],
      agentNotificationsFindMany: [
        { id: 'notif-1', agentId: 'agent-1', readAt: null },
        { id: 'notif-2', agentId: 'agent-1', readAt: null },
      ],
      agentProvidersFindMany: [
        { id: 'prov-1', agentId: 'agent-1', providerType: 'openai' },
        { id: 'prov-2', agentId: 'agent-1', providerType: 'anthropic' },
      ],
    });

    mockReadOperationalMemoryState.mockResolvedValue({
      checkpointSummaryMessage: { operationalMemoryGeneration: 3 },
      metrics: {
        recentRawMessageCount: 10,
        recentRawTokenCount: 5000,
        recentRawTokenLimit: 10000,
        overflowMessageCount: 2,
        overflowTokenCount: 1000,
        observationTokenCount: 500,
        checkpointTokenCount: 300,
        reflectionTokenCount: 0,
      },
      observationMessages: [{ id: 'obs1' }],
      reflectionMessages: [],
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result).not.toBeNull();
    expect(result!.agentId).toBe('agent-1');
    expect(result!.name).toBe('Test Agent');
    expect(result!.executionState).toBe('idle');
    expect(result!.roleName).toBe('Admin');
    expect(result!.loaded).toBe(false);
    expect(result!.providerTypes).toEqual(['anthropic', 'openai']);
    expect(result!.overview.unreadNotificationCount).toBe(2);
    expect(result!.overview.lastStepAt).toBe(now - 10000);
    expect(result!.overview.lastStepCostUsd).toBe(0.03);
    expect(result!.overview.om).toMatchObject({
      generationCount: 3,
      checkpointGeneration: 3,
      recentRawTokenCount: 5000,
      recentRawTokenLimit: 10000,
      overflowTokenCount: 1000,
      overflowTokenLimit: 5000,
      observationTokenCount: 500,
      checkpointTokenCount: 300,
      reflectionTokenCount: 0,
    });
  });

  it('sets roleName to null when agent has no roleId', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result).not.toBeNull();
    expect(result!.roleName).toBeNull();
    expect(result!.roleId).toBeNull();
    expect(result!.modelProfile).toBeNull();
    expect(result!.omModelProfile).toBeNull();
  });

  it('sets loaded to false when runtime is null', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.loaded).toBe(false);
    expect(result!.runner).toBeNull();
  });

  it('sets ltm.running and ltm.queued to false when executionState is not idle', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'running',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.overview.ltm.running).toBe(false);
    expect(result!.overview.ltm.queued).toBe(false);
  });

  it('sets averageStepIntervalMs to null when fewer than 2 steps', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
      agentExecutionStepsFindMany: [
        mockStep({ id: 'step-1', createdAt: now - 10000, costUsd: 0.01, inputTokens: 1000 }),
      ],
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.overview.averageStepIntervalMs).toBeNull();
  });

  it('calculates averageStepIntervalMs correctly for multiple steps', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
      agentExecutionStepsFindMany: [
        mockStep({ id: 'step-1', createdAt: now - 90000, costUsd: 0.01, inputTokens: 1000 }),
        mockStep({ id: 'step-2', createdAt: now - 60000, costUsd: 0.02, inputTokens: 2000 }),
        mockStep({ id: 'step-3', createdAt: now - 30000, costUsd: 0.03, inputTokens: 3000 }),
      ],
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    // Steps at now-90000, now-60000, now-30000 → intervals: 30s, 30s → avg: 30s
    expect(result!.overview.averageStepIntervalMs).toBe(30000);
  });

  it('sets om to null when readOperationalMemoryState rejects (timeout/error)', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    mockReadOperationalMemoryState.mockRejectedValue(new Error('Timeout'));

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result).not.toBeNull();
    expect(result!.overview.om).toBeNull();
  });

  it('uses lastStep.createdAt as lastStepAt in overview', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
      agentExecutionStepsFindMany: [
        mockStep({ id: 'step-1', createdAt: 1000000000000, costUsd: 0.05, inputTokens: 5000 }),
      ],
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.overview.lastStepAt).toBe(1000000000000);
  });

  it('sorts providerTypes alphabetically', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
      agentProvidersFindMany: [
        { id: 'prov-1', agentId: 'agent-1', providerType: 'zebra' },
        { id: 'prov-2', agentId: 'agent-1', providerType: 'alpha' },
        { id: 'prov-3', agentId: 'agent-1', providerType: 'beta' },
      ],
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.providerTypes).toEqual(['alpha', 'beta', 'zebra']);
  });

  it('includes createdAt and updatedAt from agent row', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.createdAt).toBe(now);
    expect(result!.updatedAt).toBe(now);
  });

  it('calls toMastraSafeIdentifier for workspace path generation', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    mockToMastraSafeIdentifier.mockReturnValue('safe-agent-1');

    await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(mockToMastraSafeIdentifier).toHaveBeenCalledWith('agent-1');
  });






  it('ltm packageCount is 0 when ltm store readState times out', async () => {
    const now = Date.now();
    const db = makeMockDb({
      agentsFindFirst: {
        id: 'agent-1',
        name: 'Test Agent',
        description: null,
        executionState: 'idle',
        lastExecutionError: null,
        lastExecutionErrorAt: null,
        roleId: null,
        modelProfileId: null,
        omModelProfileId: null,
        createdAt: now,
        updatedAt: now,
      },
    });

    mockCreateLtmStore.mockReturnValue({
      readState: vi.fn().mockRejectedValue(new Error('LTM timeout')),
    });

    const result = await readAgentHomeMetricSnapshot({
      db,
      workspaceBasePath: '/tmp',
      agentId: 'agent-1',
      runtime: null,
      runnerSnapshot: null,
    });

    expect(result!.overview.ltm.packageCount).toBe(0);
  });
});
