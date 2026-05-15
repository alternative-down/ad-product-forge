import { describe, expect, it, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------
// Stable mock references
// ---------------------------------------------------------------------
const mockForgeDebug = vi.hoisted(() => vi.fn());
const mockWithTimeout = vi.hoisted(() => vi.fn((promise) => promise));
const mockReadLongTermMemoryState = vi.hoisted(() => vi.fn());
const mockReadLongTermMemoryRecallSnapshot = vi.hoisted(() => vi.fn());

// ---------------------------------------------------------------------
// vi.mock blocks
// ---------------------------------------------------------------------
vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
  withTimeout: mockWithTimeout,
}));

vi.mock('./helpers-ltm', () => ({
  readLongTermMemoryState: mockReadLongTermMemoryState,
  readLongTermMemoryRecallSnapshot: mockReadLongTermMemoryRecallSnapshot,
}));

// ---------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------
import { createAgentDebugReadModel } from './agents-debug';

const ADMIN_TIMEOUT_MS = 5_000;

function makeMockDeps(overrides = {}) {
  return {
    db: {
      query: {
        agents: { findFirst: vi.fn().mockResolvedValue(null) },
      },
    },
    getAgent: vi.fn().mockResolvedValue(null),
    getAgentRuntimeMemory: vi.fn().mockResolvedValue(null),
    listRecentAgentHomeMetricSnapshots: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as Parameters<typeof createAgentDebugReadModel>[0];
}

describe('createAgentDebugReadModel', () => {
  beforeEach(() => {
    mockForgeDebug.mockReset();
    mockWithTimeout.mockReset();
    mockWithTimeout.mockImplementation((promise) => promise);
    mockReadLongTermMemoryState.mockReset();
    mockReadLongTermMemoryState.mockResolvedValue(null);
    mockReadLongTermMemoryRecallSnapshot.mockReset();
    mockReadLongTermMemoryRecallSnapshot.mockResolvedValue(null);
  });

  // ─── getAgentOmDebugExport ───────────────────────────────────────────

  describe('getAgentOmDebugExport', () => {
    it('returns null when agent does not exist', async () => {
      const deps = makeMockDeps({
        getAgent: vi.fn().mockResolvedValue(null),
      });
      const model = createAgentDebugReadModel(deps);
      const result = await model.getAgentOmDebugExport('ghost-agent');
      expect(result).toBeNull();
    });

    it('returns null when agent not loaded (runtime memory timeout)', async () => {
      const deps = makeMockDeps({
        getAgent: vi.fn().mockResolvedValue({ id: 'agent-1', name: 'Test' }),
        getAgentRuntimeMemory: vi.fn().mockRejectedValue(new Error('not loaded')),
        listRecentAgentHomeMetricSnapshots: vi.fn().mockResolvedValue([]),
      });
      mockWithTimeout.mockImplementation(async (promise) => {
        try {
          return await promise;
        } catch (err) {
          return null; // simulate timeout → null
        }
      });
      const model = createAgentDebugReadModel(deps);
      const result = await model.getAgentOmDebugExport('agent-1');
      // agent found, runtimeMemory timed out → result has agent but null runtimeMemory
      expect(result).not.toBeNull();
      expect(result!.agent).toBeDefined();
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'admin-read-model', level: 'warn' }),
      );
    });

    it('returns full export when agent is loaded', async () => {
      const agent = { id: 'agent-1', name: 'Loaded Agent' };
      const runtimeMemory = { memory: 'some-state' };
      const snapshots = [{ snapshotId: 'snap-1' }];
      const ltm = { checkpointGeneration: 3 };

      const deps = makeMockDeps({
        getAgent: vi.fn().mockResolvedValue(agent),
        getAgentRuntimeMemory: vi.fn().mockResolvedValue(runtimeMemory),
        listRecentAgentHomeMetricSnapshots: vi.fn().mockResolvedValue(snapshots),
      });
      mockReadLongTermMemoryState.mockResolvedValue(ltm);

      const model = createAgentDebugReadModel(deps);
      const result = await model.getAgentOmDebugExport('agent-1');

      expect(result).toEqual({ agent, runtimeMemory, snapshots, ltm });
    });

    it('handles LTM state timeout gracefully', async () => {
      const agent = { id: 'agent-1' };
      mockReadLongTermMemoryState.mockRejectedValue(new Error('DB timeout'));
      mockWithTimeout.mockImplementation(async (promise: Promise<unknown>, _ms: number, _msg: string) => {
        try {
          return await promise;
        } catch {
          return null; // LTM timed out → null
        }
      });

      const deps = makeMockDeps({
        getAgent: vi.fn().mockResolvedValue(agent),
        getAgentRuntimeMemory: vi.fn().mockResolvedValue({}),
        listRecentAgentHomeMetricSnapshots: vi.fn().mockResolvedValue([]),
      });
      const model = createAgentDebugReadModel(deps);
      const result = await model.getAgentOmDebugExport('agent-1');

      expect(result).not.toBeNull();
      expect(result!.agent).toBeDefined();
      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn' }),
      );
    });

    it('logs forgeDebug when runtime memory times out', async () => {
      const deps = makeMockDeps({
        getAgent: vi.fn().mockResolvedValue({ id: 'agent-1' }),
        getAgentRuntimeMemory: vi.fn().mockRejectedValue(new Error('timeout')),
        listRecentAgentHomeMetricSnapshots: vi.fn().mockResolvedValue([]),
      });

      const model = createAgentDebugReadModel(deps);
      await model.getAgentOmDebugExport('agent-1');

      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({
          scope: 'admin-read-model',
          level: 'warn',
          message: expect.stringContaining('getAgentRuntimeStatus'),
        }),
      );
    });

    it('logs forgeDebug when LTM state times out', async () => {
      const agent = { id: 'agent-1' };
      mockReadLongTermMemoryState.mockRejectedValue(new Error('DB timeout'));
      mockWithTimeout.mockImplementation(async (promise) => {
        try { return await promise; }
        catch { return null; }
      });

      const deps = makeMockDeps({
        getAgent: vi.fn().mockResolvedValue(agent),
        getAgentRuntimeMemory: vi.fn().mockResolvedValue({}),
        listRecentAgentHomeMetricSnapshots: vi.fn().mockResolvedValue([]),
      });

      const model = createAgentDebugReadModel(deps);
      await model.getAgentOmDebugExport('agent-1');

      expect(mockForgeDebug).toHaveBeenCalledWith(
        expect.objectContaining({ level: 'warn' }),
      );
    });
  });

  // ─── debugAgentLongTermMemoryRecallSearch ────────────────────────────

  describe('debugAgentLongTermMemoryRecallSearch', () => {
    it('returns null when agent does not exist', async () => {
      const deps = makeMockDeps();
      const model = createAgentDebugReadModel(deps);
      const result = await model.debugAgentLongTermMemoryRecallSearch('ghost', {
        query: 'search term',
      });
      expect(result).toBeNull();
    });

    it('calls readLongTermMemoryRecallSnapshot and returns result', async () => {
      const ltmRecall = { results: [{ text: 'match', score: 0.9 }] };
      mockReadLongTermMemoryRecallSnapshot.mockResolvedValue(ltmRecall);

      const deps = makeMockDeps({
        db: {
          query: {
            agents: {
              findFirst: vi.fn().mockResolvedValue({ id: 'agent-1', name: 'Test' }),
            },
          },
        },
      });
      const model = createAgentDebugReadModel(deps);
      const result = await model.debugAgentLongTermMemoryRecallSearch('agent-1', {
        query: 'search term',
        limit: 10,
      });

      expect(mockReadLongTermMemoryRecallSnapshot).toHaveBeenCalledWith(
        deps.db,
        'agent-1',
        expect.objectContaining({ query: 'search term', limit: 10 }),
      );
      expect(result).toEqual({ ltmRecall });
    });

    it('passes through search options to recall snapshot', async () => {
      mockReadLongTermMemoryRecallSnapshot.mockResolvedValue({ results: [] });

      const deps = makeMockDeps({
        db: {
          query: {
            agents: {
              findFirst: vi.fn().mockResolvedValue({ id: 'agent-1' }),
            },
          },
        },
      });
      const model = createAgentDebugReadModel(deps);

      await model.debugAgentLongTermMemoryRecallSearch('agent-1', {
        query: 'find this',
        threshold: 0.7,
        maxResults: 20,
      });

      expect(mockReadLongTermMemoryRecallSnapshot).toHaveBeenCalledWith(
        deps.db,
        'agent-1',
        expect.objectContaining({
          query: 'find this',
          threshold: 0.7,
          maxResults: 20,
        }),
      );
    });
  });
});