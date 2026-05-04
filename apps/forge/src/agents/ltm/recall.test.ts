import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createAgentLongTermMemoryRecall } from './recall';

// =============================================================================
// vi.hoisted — defined before vi.mock runs so the factory can reference them.
// The mock returns a class for SqliteWorkspaceRetrieval so 'new Class()' works.
// =============================================================================

const { spies, retrievalRef } = vi.hoisted(() => {
  const spies = {
    refresh: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(),
    search: vi.fn().mockResolvedValue({ results: [], formatted: '' }),
    getIndexStats: vi.fn().mockResolvedValue({
      workspaceFileCount: 0, memoryFileCount: 0, checkpointFileCount: 0,
    }),
    getStats: vi.fn().mockResolvedValue({
      activeIndexStats: { dimension: 128, count: 0, metric: 'cosine' },
    }),
    queryVectorIndex: vi.fn(),
    searchHybrid: vi.fn(),
    searchBm25: vi.fn(),
    searchGraph: vi.fn().mockResolvedValue({
      hit: false, score: null, context: '', sourcesCount: 0,
      sourcesJson: null, rawJson: null, error: null,
      queryText: '', dimension: 0, includeSources: false, relevantContextRaw: null,
    }),
  };

  // RetrievalRef lets tests access spies via retrieval() without a top-level var
  const retrievalRef: { current: typeof spies } = { current: spies };
  return { spies, retrievalRef };
});

vi.mock('@forge-runtime/core', () => {
  class SqliteWorkspaceRetrieval {
    refresh = spies.refresh;
    dispose = spies.dispose;
    search = spies.search;
    getIndexStats = spies.getIndexStats;
    getStats = spies.getStats;
    queryVectorIndex = spies.queryVectorIndex;
    searchHybrid = spies.searchHybrid;
    searchBm25 = spies.searchBm25;
    searchGraph = spies.searchGraph;
  }

  return {
    SqliteWorkspaceRetrieval,
    FilesystemDocumentSource: vi.fn(),
    forgeDebug: vi.fn(),
    embedTextWithWorkspaceEmbedder: vi.fn().mockResolvedValue(new Array(128).fill(0.1)),
    readOperationalMemoryState: vi.fn().mockResolvedValue({
      messages: [], metrics: { rawMessageCount: 0 },
    }),
  };
});

function retrieval() { return retrievalRef.current; }

// =============================================================================
// Shared temp paths (initialized lazily, reused across tests)
// =============================================================================

let wsPath = '';
let memPath = '';

async function ensurePaths() {
  if (!wsPath) {
    wsPath = await mkdtemp(path.join(tmpdir(), 'ltm-ws-'));
    memPath = await mkdtemp(path.join(tmpdir(), 'ltm-mem-'));
  }
}

// =============================================================================
// Helper mock stores
// =============================================================================

function store() {
  return {
    addMessage: vi.fn().mockResolvedValue(undefined),
    listMessages: vi.fn().mockResolvedValue({ messages: [], hasMore: false }),
  };
}

function persist(overrides = {}) {
  return {
    writeRecallState: vi.fn().mockResolvedValue(undefined),
    readRecallState: vi.fn().mockResolvedValue({
      history: { recentFingerprints: [], rawWindowMessageCount: 0 },
    }),
    readRecallIndexStamp: vi.fn().mockResolvedValue('stamp-1'),
    persistRecallSnapshot: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function settings(overrides = {}) {
  return {
    ltmRecallSearchMode: 'hybrid' as const,
    ltmRecallScoreThreshold: 0.1,
    ltmRecallDocumentCount: 5,
    ltmRecallGraphRandomWalkSteps: 3,
    ltmRecallGraphIncludeSources: false,
    ltmRecallWorkspaceTopK: 5,
    ltmRecallGraphTopK: 5,
    ...overrides,
  };
}

// =============================================================================
// createAgentLongTermMemoryRecall factory
// =============================================================================

describe('createAgentLongTermMemoryRecall', () => {
  beforeEach(ensurePaths);

  it('returns an object with all four public methods', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      persistenceStore: persist(),
    });
    expect(recall).toBeDefined();
    expect(typeof recall.initialize).toBe('function');
    expect(typeof recall.dispose).toBe('function');
    expect(typeof recall.refreshIndex).toBe('function');
    expect(typeof recall.debugSearch).toBe('function');
  });
});

// =============================================================================
// AgentLongTermMemoryRecall initialize
// =============================================================================

describe('AgentLongTermMemoryRecall initialize', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  beforeEach(ensurePaths);

  it('resolves without throwing', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      persistenceStore: persist(),
    });
    await expect(recall.initialize()).resolves.toBeUndefined();
  });

  it('calls retrievalWorkspace.refresh() once on first init', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      persistenceStore: persist(),
    });
    await recall.initialize();
    expect(retrieval().refresh).toHaveBeenCalledTimes(1);
  });

  it('is idempotent — second init does not refresh again', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      persistenceStore: persist(),
    });
    await recall.initialize();
    retrieval().refresh.mockClear();
    await recall.initialize();
    expect(retrieval().refresh).not.toHaveBeenCalled();
  });
});

// =============================================================================
// AgentLongTermMemoryRecall dispose
// =============================================================================

describe('AgentLongTermMemoryRecall dispose', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  beforeEach(ensurePaths);

  it('resolves without throwing', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      persistenceStore: persist(),
    });
    await recall.initialize();
    await expect(recall.dispose()).resolves.toBeUndefined();
  });
});

// =============================================================================
// AgentLongTermMemoryRecall refreshIndex
// =============================================================================

describe('AgentLongTermMemoryRecall refreshIndex', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  beforeEach(ensurePaths);

  it('re-indexes when stamp has changed (refresh called)', async () => {
    let stampCount = 0;
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      persistenceStore: persist({
        readRecallIndexStamp: vi.fn().mockImplementation(() => {
          stampCount++;
          return stampCount === 1 ? 'stamp-v1' : 'stamp-v2';
        }),
      }),
    });
    await recall.initialize();
    retrieval().refresh.mockClear();
    await recall.refreshIndex();
    await recall.refreshIndex();
    expect(stampCount).toBeGreaterThanOrEqual(2);
    expect(retrieval().refresh).toHaveBeenCalled();
  });

  it('skips re-index when stamp is unchanged', async () => {
    const persistSpy = vi.fn().mockResolvedValue(undefined);
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      persistenceStore: persist({
        readRecallIndexStamp: vi.fn().mockResolvedValue('same-stamp'),
        persistRecallSnapshot: persistSpy,
      }),
    });
    await recall.initialize();
    await recall.refreshIndex();
    await recall.refreshIndex();
    expect(persistSpy).not.toHaveBeenCalled();
  });
});

// =============================================================================
// AgentLongTermMemoryRecall recallFromStep
// =============================================================================

describe('AgentLongTermMemoryRecall recallFromStep', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  beforeEach(ensurePaths);

  it('returns null when another recall is already in flight (concurrent guard)', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      readRuntimeMemorySettings: async () => settings(),
      persistenceStore: persist(),
    });
    await recall.initialize();
    const first = recall.recallFromStep({ step: { id: 's1' }, steps: [], threadId: null });
    const second = recall.recallFromStep({ step: { id: 's2' }, steps: [], threadId: null });
    const results = await Promise.all([first, second]);
    expect(results[1]).toBeNull();
  });

  it('returns null when readRuntimeMemorySettings is not provided', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      persistenceStore: persist(),
    });
    await recall.initialize();
    const result = await recall.recallFromStep({
      step: { id: 's1', text: 'some query text' },
      steps: [], threadId: null,
    });
    expect(result).toBeNull();
  });

  it('returns null when step has no extractable text content', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      readRuntimeMemorySettings: async () => settings(),
      persistenceStore: persist(),
    });
    await recall.initialize();
    const result = await recall.recallFromStep({
      step: { id: 's1', text: '' }, steps: [], threadId: null,
    });
    expect(result).toBeNull();
  });
});

// =============================================================================
// AgentLongTermMemoryRecall debugSearch
// =============================================================================

describe('AgentLongTermMemoryRecall debugSearch', () => {
  beforeEach(() => { vi.clearAllMocks(); });
  beforeEach(ensurePaths);

  it.skip('returns a result object with all expected fields', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      readRuntimeMemorySettings: async () => settings(),
      persistenceStore: persist(),
    });
    await recall.initialize();
    const result = await recall.debugSearch({ query: 'test query' });
    expect(result).toBeDefined();
    expect(typeof result.query).toBe('string');
    expect(typeof result.searchMode).toBe('string');
    expect(Array.isArray(result.availableIndexes)).toBe(true);
    expect(typeof result.lastInitAt).toBe('string');
    expect(typeof result.workspaceCanHybrid).toBe('boolean');
    expect(typeof result.injectedSystemMessage).toBe('string');
    expect(typeof result.queryEmbeddingDimension).toBe('number');
    expect(typeof result.activeIndexName).toBe('string');
  });

  it('returns empty query for whitespace-only input', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      readRuntimeMemorySettings: async () => settings(),
      persistenceStore: persist(),
    });
    await recall.initialize();
    const result = await recall.debugSearch({ query: '   ' });
    expect(result.query).toBe('');
    expect(result.queryEmbedding).toEqual([]);
  });

  it.skip('returns graphHit=false when no graph hit occurs', async () => {
    const recall = createAgentLongTermMemoryRecall({
      agentId: 'agent-1',
      agentWorkspacePath: wsPath,
      agentMemoryPath: memPath,
      mastraId: 'mastra-1',
      conversationStore: store(),
      readRuntimeMemorySettings: async () => settings(),
      persistenceStore: persist(),
    });
    await recall.initialize();
    const result = await recall.debugSearch({ query: 'some text' });
    expect(result.graphHit).toBe(false);
  });
});