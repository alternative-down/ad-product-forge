import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAgentListReadModel } from './agents-list';

// ---------------------------------------------------------------------
// Stable mock references
// ---------------------------------------------------------------------
const mockForgeDebug = vi.hoisted(() => vi.fn());
const mockWithTimeout = vi.hoisted(() => vi.fn((p: Promise<unknown>) => p));
const mockReadLongTermMemoryState = vi.hoisted(() => vi.fn());
const mockListThreadMessages = vi.hoisted(() => vi.fn());
const mockReadOperationalMemoryState = vi.hoisted(() => vi.fn());
const mockCreateSystemSettingsStore = vi.hoisted(() =>
  vi.fn().mockReturnValue({
    getSettings: vi.fn().mockResolvedValue({
      checkpointedOmRecentRawTokens: 0,
      checkpointedOmRawObservationBatchTokens: 0,
      checkpointedOmObservationReflectionBatchTokens: 0,
      checkpointedOmTotalContextTokens: 0,
    }),
  }),
);

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
  withTimeout: mockWithTimeout,
  errorMsg: (err: unknown) => String(err),
  readOperationalMemoryState: mockReadOperationalMemoryState,
  toMastraSafeIdentifier: (s: string) => s.replace(/[^a-zA-Z0-9_]/g, '_'),
  LibsqlConversationStore: vi.fn().mockImplementation(() => ({
    read: vi.fn().mockResolvedValue({ workingMemory: null }),
  })),
}));

vi.mock('./conversation-helpers', () => ({
  listThreadMessages: mockListThreadMessages,
}));

vi.mock('./helpers-ltm', () => ({
  readLongTermMemoryState: mockReadLongTermMemoryState,
}));

vi.mock('../../system-settings/store', () => ({
  createSystemSettingsStore: mockCreateSystemSettingsStore,
}));

vi.mock('../../agents/workspace-skills', () => ({
  listAgentWorkspaceSkills: vi.fn().mockResolvedValue([]),
}));

import type { LibSQLDatabase } from 'drizzle-orm/libsql';

function makeMockDb() {
  // Declare query as 'any' so vi.fn() is typed as Mock<unknown> → mockResolvedValueOnce available
  const _query: any = {
    agents: { findMany: vi.fn(), findFirst: vi.fn() },
    agentRoles: { findMany: vi.fn() },
    llmProfiles: { findMany: vi.fn() },
    agentExecutionSteps: { findMany: vi.fn() },
    agentNotifications: { findMany: vi.fn() },
    agentSchedules: { findMany: vi.fn() },
  };
  return {
    batch: vi.fn().mockReturnThis(),
    resultKind: vi.fn().mockReturnThis(),
    _: vi.fn().mockReturnThis(),
    $with: vi.fn().mockReturnThis(),
    run: vi.fn().mockReturnThis(),
    prepare: vi.fn().mockReturnThis(),
    transaction: vi.fn().mockReturnThis(),
    drizzle: vi.fn().mockReturnThis(),
    $primary: vi.fn().mockReturnThis(),
    $client: vi.fn().mockReturnThis(),
    $nodes: vi.fn().mockReturnThis(),
    $docs: vi.fn().mockReturnThis(),
    $count: vi.fn().mockResolvedValue(0),
    $relation: vi.fn().mockReturnThis(),
    $get: vi.fn().mockReturnThis(),
    with: vi.fn().mockReturnThis(),
    query: _query,
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          groupBy: vi.fn().mockReturnValue({ all: vi.fn().mockResolvedValue([]) }),
        }),
      }),
    }),
  } as any;
}

function makeMockRegistry(agents = new Map()) {
  return { get: vi.fn((id: string) => agents.get(id)), size: agents.size };
}

describe('createAgentListReadModel', () => {
  beforeEach(() => {
    mockForgeDebug.mockReset();
    mockWithTimeout.mockReset();
    mockWithTimeout.mockImplementation((p: Promise<unknown>) => p);
    mockReadLongTermMemoryState.mockReset();
    mockReadLongTermMemoryState.mockResolvedValue(null);
    mockListThreadMessages.mockReset();
    mockListThreadMessages.mockResolvedValue({ items: [], hasMore: false });
    mockReadOperationalMemoryState.mockReset();
    mockReadOperationalMemoryState.mockResolvedValue(null);
  });

  describe('listAgents', () => {
    it('returns empty array when no agents exist', async () => {
      const db = makeMockDb();
      const model = createAgentListReadModel({
        db,
        registry: makeMockRegistry(),
        workspaceBasePath: '/tmp',
      });
      const result = await model.listAgents();
      expect(result).toEqual([]);
    });

    it('maps basic fields (agentId, name, description, executionState)', async () => {
      const db = makeMockDb();
      db.query.agents.findMany.mockResolvedValueOnce([
        {
          id: 'a1',
          name: 'Test Agent',
          description: 'A test agent',
          executionState: 'idle',
          role: null,
          modelProfileId: null,
          omModelProfileId: null,
          loaded: false,
          createdAt: 0,
          updatedAt: 0,
        },
      ]);
      db.query.agentRoles.findMany.mockResolvedValueOnce([]);
      db.query.llmProfiles.findMany.mockResolvedValueOnce([]);
      db.query.agentExecutionSteps.findMany.mockResolvedValueOnce([]);
      db.query.agentNotifications.findMany.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            groupBy: vi.fn().mockReturnValueOnce({ all: vi.fn().mockResolvedValue([]) }),
          }),
        }),
      });

      const model = createAgentListReadModel({
        db,
        registry: makeMockRegistry(new Map([['a1', {}]])),
        workspaceBasePath: '/tmp',
      });
      const result = await model.listAgents();

      expect(result).toHaveLength(1);
      expect(result[0].agentId).toBe('a1');
      expect(result[0].name).toBe('Test Agent');
      expect(result[0].executionState).toBe('idle');
    });

    it('defaults executionState to absent when null', async () => {
      const db = makeMockDb();
      db.query.agents.findMany.mockResolvedValueOnce([
        {
          id: 'ghost',
          name: 'Ghost',
          description: null,
          executionState: null,
          role: null,
          modelProfileId: null,
          omModelProfileId: null,
          loaded: false,
          createdAt: 0,
          updatedAt: 0,
        },
      ]);
      db.query.agentRoles.findMany.mockResolvedValueOnce([]);
      db.query.llmProfiles.findMany.mockResolvedValueOnce([]);
      db.query.agentExecutionSteps.findMany.mockResolvedValueOnce([]);
      db.query.agentNotifications.findMany.mockResolvedValueOnce([]);
      db.select.mockReturnValueOnce({
        from: vi.fn().mockReturnValueOnce({
          where: vi.fn().mockReturnValueOnce({
            groupBy: vi.fn().mockReturnValueOnce({ all: vi.fn().mockResolvedValue([]) }),
          }),
        }),
      });

      const model = createAgentListReadModel({
        db,
        registry: makeMockRegistry(),
        workspaceBasePath: '/tmp',
      });
      const result = await model.listAgents();
      expect(result[0].executionState).toBe('absent');
    });
  });

  describe('getAgent', () => {
    it('returns null when agent not found', async () => {
      const db = makeMockDb();
      const model = createAgentListReadModel({
        db,
        registry: makeMockRegistry(),
        workspaceBasePath: '/tmp',
      });
      const result = await model.getAgent('ghost-agent');
      expect(result).toBeNull();
    });
  });
});
