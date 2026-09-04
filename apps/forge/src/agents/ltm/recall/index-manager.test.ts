import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockForgeDebug = vi.hoisted(() => vi.fn());

vi.mock('@forge-runtime/core', () => ({ forgeDebug: mockForgeDebug }));

import { IndexManager, createIndexManager, type IndexManagerDeps } from './index-manager';

function makeDeps(): IndexManagerDeps {
  return {
    agentId: 'agent-index',
    retrievalWorkspace: {
      refresh: vi.fn().mockResolvedValue(undefined),
      getStats: vi.fn().mockResolvedValue({
        availableIndexes: ['forge_runtime_memory_recall'],
        activeIndexStats: { dimension: 384, count: 10, metric: 'cosine' },
      }),
    } as IndexManagerDeps['retrievalWorkspace'],
    persistence: {
      setLastInitAt: vi.fn(),
      getIndexStats: vi.fn().mockResolvedValue({
        workspaceFileCount: 1,
        memoryFileCount: 2,
        checkpointFileCount: 0,
      }),
    } as unknown as IndexManagerDeps['persistence'],
    inFlightTracker: {
      runTrackedRecallOperation: vi
        .fn()
        .mockImplementation((_label: string, operation: Promise<unknown>) => operation),
    } as unknown as IndexManagerDeps['inFlightTracker'],
    initTimeoutMs: 30_000,
  };
}

describe('IndexManager', () => {
  beforeEach(() => mockForgeDebug.mockReset());

  it('initializes the retrieval index once', async () => {
    const deps = makeDeps();
    const manager = createIndexManager(deps);
    await manager.initialize();
    await manager.initialize();
    expect(deps.retrievalWorkspace.refresh).toHaveBeenCalledOnce();
    expect(manager.getLastInitAt()).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('refreshes on every explicit refresh so manual file edits are indexed', async () => {
    const deps = makeDeps();
    const manager = createIndexManager(deps);
    await manager.initialize();
    await manager.refreshIndex();
    await manager.refreshIndex();
    expect(deps.retrievalWorkspace.refresh).toHaveBeenCalledTimes(3);
    expect(deps.persistence.setLastInitAt).toHaveBeenCalledTimes(3);
  });

  it('reports semantic, BM25, and hybrid index capabilities', async () => {
    const manager = createIndexManager(makeDeps());
    await expect(manager.getWorkspaceIndexState()).resolves.toMatchObject({
      workspaceCanBm25: true,
      workspaceCanVector: true,
      workspaceCanHybrid: true,
      availableIndexes: ['forge_runtime_memory_recall'],
    });
  });

  it('delegates index statistics to persistence', async () => {
    const manager = createIndexManager(makeDeps());
    await expect(manager.getIndexStats()).resolves.toEqual({
      workspaceFileCount: 1,
      memoryFileCount: 2,
      checkpointFileCount: 0,
    });
  });

  it('supports direct and factory construction', () => {
    expect(createIndexManager(makeDeps())).toBeInstanceOf(IndexManager);
    expect(new IndexManager(makeDeps())).toBeInstanceOf(IndexManager);
  });
});
