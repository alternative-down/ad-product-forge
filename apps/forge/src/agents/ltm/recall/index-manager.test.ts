import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockForgeDebug = vi.hoisted(() => vi.fn());

vi.mock('@forge-runtime/core', () => ({
  forgeDebug: mockForgeDebug,
}));

import {
  IndexManager,
  createIndexManager,
  type IndexManagerDeps,
} from './index-manager';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeDeps(overrides: Partial<IndexManagerDeps> = {}): any {
  return {
    agentId: 'ag_idx',
    retrievalWorkspace: {
      refresh: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn().mockResolvedValue({
        availableIndexes: ['forge_runtime_memory_recall'],
        activeIndexName: 'forge_runtime_memory_recall',
        activeIndexStats: { dimension: 384, count: 10, metric: 'cosine' },
      }),
    },
    persistence: {
      setLastInitAt: vi.fn(),
      getIndexStats: vi.fn().mockResolvedValue({
        workspaceFileCount: 1,
        memoryFileCount: 2,
        checkpointFileCount: 3,
      }),
    },
    persistenceStore: {
      readRecallIndexStamp: vi.fn().mockResolvedValue('stamp_v1'),
    },
    inFlightTracker: {
      runTrackedRecallOperation: vi.fn().mockImplementation((_label, op) => op),
    },
    initTimeoutMs: 30_000,
    ...overrides,
  };
}

beforeEach(() => {
  mockForgeDebug.mockReset();
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('IndexManager', () => {
  describe('initial state', () => {
    it('starts with lastInitAt === null', () => {
      const deps = makeDeps();
      const mgr = createIndexManager(deps);
      expect(mgr.getLastInitAt()).toBeNull();
    });
  });

  describe('initialize()', () => {
    it('runs full init on first call', async () => {
      const deps = makeDeps();
      const mgr = createIndexManager(deps);
      await mgr.initialize();

      expect(deps.retrievalWorkspace.refresh).toHaveBeenCalledTimes(1);
      expect(deps.inFlightTracker.runTrackedRecallOperation).toHaveBeenCalledWith(
        'retrieval.refresh',
        expect.anything(),
        30_000,
        'ltm recall retrieval init timed out',
      );
      expect(mgr.getLastInitAt()).not.toBeNull();
      expect(deps.persistence.setLastInitAt).toHaveBeenCalledTimes(1);
    });

    it('is idempotent: second call is a no-op', async () => {
      const deps = makeDeps();
      const mgr = createIndexManager(deps);
      await mgr.initialize();
      await mgr.initialize();

      expect(deps.retrievalWorkspace.refresh).toHaveBeenCalledTimes(1);
      expect(deps.persistence.setLastInitAt).toHaveBeenCalledTimes(1);
    });

    it('records the current index stamp after init', async () => {
      const deps = makeDeps();
      deps.persistenceStore.readRecallIndexStamp.mockResolvedValue('stamp_abc');
      const mgr = createIndexManager(deps);
      await mgr.initialize();
      // Internal: we can't directly inspect lastIndexedStamp, but the stamp should be cached
      // (verified by refreshIndex skipping on same stamp — see below)
      expect(deps.persistenceStore.readRecallIndexStamp).toHaveBeenCalled();
    });

    it('emits forgeDebug start and complete messages', async () => {
      const deps = makeDeps();
      const mgr = createIndexManager(deps);
      await mgr.initialize();

      expect(mockForgeDebug).toHaveBeenCalled();
      const messages = mockForgeDebug.mock.calls.map((c) => c[0].message);
      expect(messages).toContain('ltm recall workspace init start');
      expect(messages).toContain('ltm recall workspace init complete');
    });
  });

  describe('refreshIndex()', () => {
    it('skips refresh if stamp is unchanged', async () => {
      const deps = makeDeps();
      deps.persistenceStore.readRecallIndexStamp.mockResolvedValue('stamp_v1');
      const mgr = createIndexManager(deps);
      await mgr.initialize();
      await mgr.refreshIndex();

      // refresh was only called during initialize, not during refreshIndex
      expect(deps.retrievalWorkspace.refresh).toHaveBeenCalledTimes(1);
      expect(mockForgeDebug.mock.calls.map((c) => c[0].message)).toContain(
        'ltm recall workspace index unchanged',
      );
    });

    it('runs full refresh if stamp changed', async () => {
      const deps = makeDeps();
      // First call returns v1, second call returns v2
      deps.persistenceStore.readRecallIndexStamp
        .mockResolvedValueOnce('stamp_v1')
        .mockResolvedValueOnce('stamp_v2');
      const mgr = createIndexManager(deps);
      await mgr.initialize();
      await mgr.refreshIndex();

      // refresh called twice: once in init, once in reindex
      expect(deps.retrievalWorkspace.refresh).toHaveBeenCalledTimes(2);
      const lastInitAt = mgr.getLastInitAt();
      expect(lastInitAt).not.toBeNull();
    });

    it('updates persistence.setLastInitAt on reindex', async () => {
      const deps = makeDeps();
      deps.persistenceStore.readRecallIndexStamp
        .mockResolvedValueOnce('stamp_v1')
        .mockResolvedValueOnce('stamp_v2');
      const mgr = createIndexManager(deps);
      await mgr.initialize();
      mockForgeDebug.mockClear();
      await mgr.refreshIndex();
      expect(deps.persistence.setLastInitAt).toHaveBeenCalledTimes(2); // init + reindex
    });
  });

  describe('getWorkspaceIndexState()', () => {
    it('returns workspaceCan* flags + retrieval stats', async () => {
      const deps = makeDeps();
      const mgr = createIndexManager(deps);
      const state = await mgr.getWorkspaceIndexState();

      expect(state.workspaceCanBm25).toBe(true);
      expect(state.workspaceCanVector).toBe(true);
      expect(state.workspaceCanHybrid).toBe(true);
      expect(state.availableIndexes).toEqual(['forge_runtime_memory_recall']);
      expect(state.activeIndexName).toBe('forge_runtime_memory_recall');
    });

    it('overrides retrieval stats with static flags', async () => {
      const deps = makeDeps();
      deps.retrievalWorkspace.getStats.mockResolvedValue({
        availableIndexes: ['x'],
        activeIndexName: 'y',
        // missing workspaceCan* fields — should be added by spread
      });
      const mgr = createIndexManager(deps);
      const state = await mgr.getWorkspaceIndexState();
      expect(state.workspaceCanBm25).toBe(true);
      expect(state.availableIndexes).toEqual(['x']);
    });
  });

  describe('getIndexStats()', () => {
    it('delegates to persistence.getIndexStats', async () => {
      const deps = makeDeps();
      const mgr = createIndexManager(deps);
      const stats = await mgr.getIndexStats();
      expect(deps.persistence.getIndexStats).toHaveBeenCalledTimes(1);
      expect(stats).toEqual({
        workspaceFileCount: 1,
        memoryFileCount: 2,
        checkpointFileCount: 3,
      });
    });
  });

  describe('readCurrentIndexStamp()', () => {
    it('delegates to persistenceStore.readRecallIndexStamp', async () => {
      const deps = makeDeps();
      const mgr = createIndexManager(deps);
      const stamp = await mgr.readCurrentIndexStamp();
      expect(deps.persistenceStore.readRecallIndexStamp).toHaveBeenCalledTimes(1);
      expect(stamp).toBe('stamp_v1');
    });

    it('returns null when stamp is null', async () => {
      const deps = makeDeps();
      deps.persistenceStore.readRecallIndexStamp.mockResolvedValue(null);
      const mgr = createIndexManager(deps);
      const stamp = await mgr.readCurrentIndexStamp();
      expect(stamp).toBeNull();
    });
  });

  describe('getLastInitAt()', () => {
    it('returns null before any init', () => {
      const mgr = createIndexManager(makeDeps());
      expect(mgr.getLastInitAt()).toBeNull();
    });

    it('returns ISO timestamp after init', async () => {
      const mgr = createIndexManager(makeDeps());
      await mgr.initialize();
      const ts = mgr.getLastInitAt();
      expect(ts).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });
  });

  describe('class instantiation', () => {
    it('can be instantiated via factory', () => {
      const mgr = createIndexManager(makeDeps());
      expect(mgr).toBeInstanceOf(IndexManager);
    });

    it('can be instantiated via constructor', () => {
      const mgr = new IndexManager(makeDeps());
      expect(mgr).toBeInstanceOf(IndexManager);
    });
  });
});
