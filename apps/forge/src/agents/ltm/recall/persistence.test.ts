/**
 * Unit tests for agents/ltm/recall/persistence.ts
 *
 * Covers: RecallPersistence class
 *  - setLastInitAt mutates the field
 *  - readCurrentIndexStamp delegates to persistenceStore
 *  - getIndexStats uses countFiles for memory + checkpoints
 *  - persistRecallSnapshot writes via persistenceStore
 *  - readRecallThreadState filters fingerprints and computes windowSize
 *
 * Mocks the persistenceStore, conversationStore, countFiles, and the
 * @forge-runtime/core readOperationalMemoryState helper.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./count-files', () => ({
  countFiles: vi.fn(),
}));

vi.mock('@forge-runtime/core', () => ({
  readOperationalMemoryState: vi.fn(),
}));

import { RecallPersistence, createRecallPersistence } from './persistence';
import { countFiles } from './count-files';
import { readOperationalMemoryState } from '@forge-runtime/core';

function createMockDeps(opts: {
  history?: { recentFingerprints?: unknown[] } | null;
  operationalMetrics?: { rawMessageCount: number } | null;
  indexStamp?: string | null;
} = {}) {
  return {
    persistenceStore: {
      readRecallIndexStamp: vi.fn().mockResolvedValue(opts.indexStamp === undefined ? 'stamp-1' : opts.indexStamp),
      writeRecallState: vi.fn().mockResolvedValue(undefined),
      readRecallState: vi.fn().mockResolvedValue({ history: opts.history ?? null }),
    },
    conversationStore: {} as never,
    agentWorkspacePath: '/tmp/agent-ws',
    agentMemoryPath: '/tmp/agent-mem',
    lastInitAt: '2026-01-01T00:00:00Z',
  };
}

describe('RecallPersistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (countFiles as ReturnType<typeof vi.fn>).mockResolvedValue(0);
    (readOperationalMemoryState as ReturnType<typeof vi.fn>).mockResolvedValue(null);
  });

  describe('setLastInitAt', () => {
    it('updates the lastInitAt field', async () => {
      const deps = createMockDeps();
      const persistence = new RecallPersistence(deps as never);

      persistence.setLastInitAt('2026-06-02T19:00:00Z');
      // indirect verification: persistRecallSnapshotWithInput uses this.lastInitAt
      // Build a snapshot via the public API
      await persistence.persistRecallSnapshotWithInput(
        { step: null, steps: [], threadId: 't1' },
        { status: 'miss' },
      );
      const writeCall = deps.persistenceStore.writeRecallState.mock.calls[0]?.[0] as {
        snapshot: { lastInitAt?: string | null };
      };
      expect(writeCall.snapshot.lastInitAt).toBe('2026-06-02T19:00:00Z');
    });
  });

  describe('readCurrentIndexStamp', () => {
    it('returns the stamp from persistenceStore', async () => {
      const deps = createMockDeps({ indexStamp: 'stamp-42' });
      const persistence = new RecallPersistence(deps as never);

      const stamp = await persistence.readCurrentIndexStamp();

      expect(stamp).toBe('stamp-42');
      expect(deps.persistenceStore.readRecallIndexStamp).toHaveBeenCalledTimes(1);
    });

    it('returns null when no stamp exists', async () => {
      const deps = createMockDeps({ indexStamp: null });
      const persistence = new RecallPersistence(deps as never);

      const stamp = await persistence.readCurrentIndexStamp();

      expect(stamp).toBeNull();
    });
  });

  describe('getIndexStats', () => {
    it('counts workspace files under agentWorkspacePath, memory files under agentMemoryPath/memory, and checkpoints under agentMemoryPath/checkpoints', async () => {
      (countFiles as ReturnType<typeof vi.fn>).mockImplementation(
        async (root: string, rel: string) => {
          if (root === '/tmp/agent-ws' && rel === '.') return 7;
          if (root === '/tmp/agent-mem' && rel === 'memory') return 10;
          if (root === '/tmp/agent-mem' && rel === 'checkpoints') return 5;
          return 0;
        },
      );
      const deps = createMockDeps();
      const persistence = new RecallPersistence(deps as never);

      const stats = await persistence.getIndexStats();

      // One countFiles call per source: workspace root, memory, checkpoints
      expect(countFiles).toHaveBeenCalledTimes(3);
      expect(countFiles).toHaveBeenCalledWith('/tmp/agent-ws', '.');
      expect(countFiles).toHaveBeenCalledWith('/tmp/agent-mem', 'memory');
      expect(countFiles).toHaveBeenCalledWith('/tmp/agent-mem', 'checkpoints');
      expect(stats.workspaceFileCount).toBe(7);
      expect(stats.memoryFileCount).toBe(10);
      expect(stats.checkpointFileCount).toBe(5);
    });

    it('returns zeros when countFiles yields zero for every path', async () => {
      (countFiles as ReturnType<typeof vi.fn>).mockResolvedValue(0);
      const deps = createMockDeps();
      const persistence = new RecallPersistence(deps as never);

      const stats = await persistence.getIndexStats();

      expect(stats).toEqual({ workspaceFileCount: 0, memoryFileCount: 0, checkpointFileCount: 0 });
    });
  });

  describe('persistRecallSnapshot', () => {
    it('writes the snapshot via persistenceStore.writeRecallState with thread context', async () => {
      const deps = createMockDeps();
      const persistence = new RecallPersistence(deps as never);
      const snapshot = { status: 'hit' as const, lastInitAt: '2026-01-01' };
      const history = { recentFingerprints: ['a', 'b'] };

      await persistence.persistRecallSnapshot(
        { threadId: 'thread-1', resourceId: 'res-1' },
        snapshot as never,
        history as never,
      );

      expect(deps.persistenceStore.writeRecallState).toHaveBeenCalledWith({
        threadId: 'thread-1',
        resourceId: 'res-1',
        snapshot,
        history,
      });
    });
  });

  describe('readRecallThreadState', () => {
    it('returns empty fingerprints when persisted history is null', async () => {
      const deps = createMockDeps({ history: null });
      const persistence = new RecallPersistence(deps as never);

      const out = await persistence.readRecallThreadState('t1', 1000);

      expect(out.recentFingerprints).toEqual([]);
    });

    it('filters non-string and empty-string entries from recentFingerprints', async () => {
      const deps = createMockDeps({
        history: {
          recentFingerprints: ['valid', '', 'also-valid', 123, null, 'last-valid'],
        },
      });
      const persistence = new RecallPersistence(deps as never);

      const out = await persistence.readRecallThreadState('t1', 1000);

      expect(out.recentFingerprints).toEqual(['valid', 'also-valid', 'last-valid']);
    });

    it('uses default windowSize of 20 when operational memory is empty', async () => {
      (readOperationalMemoryState as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const deps = createMockDeps();
      const persistence = new RecallPersistence(deps as never);

      const out = await persistence.readRecallThreadState('t1', 1000);

      expect(out.windowSize).toBe(20);
      expect(out.rawWindowMessageCount).toBe(0);
    });

    it('computes windowSize as max(1, floor(rawMessageCount * 0.25))', async () => {
      (readOperationalMemoryState as ReturnType<typeof vi.fn>).mockResolvedValue({
        metrics: { rawMessageCount: 100 },
      });
      const deps = createMockDeps();
      const persistence = new RecallPersistence(deps as never);

      const out = await persistence.readRecallThreadState('t1', 1000);

      expect(out.rawWindowMessageCount).toBe(100);
      expect(out.windowSize).toBe(25);
    });

    it('skips readOperationalMemoryState when threadId is null', async () => {
      const deps = createMockDeps();
      const persistence = new RecallPersistence(deps as never);

      await persistence.readRecallThreadState(null, 1000);

      expect(readOperationalMemoryState).not.toHaveBeenCalled();
    });
  });

  describe('createRecallPersistence factory', () => {
    it('returns a RecallPersistence instance', () => {
      const deps = createMockDeps();
      const instance = createRecallPersistence(deps as never);
      expect(instance).toBeInstanceOf(RecallPersistence);
    });
  });
});
