import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockEmbedTextWithWorkspaceEmbedder = vi.hoisted(() => vi.fn());
const mockBuildRecallSystemMessage = vi.hoisted(() => vi.fn());

vi.mock('@forge-runtime/core', () => ({
  embedTextWithWorkspaceEmbedder: mockEmbedTextWithWorkspaceEmbedder,
}));

vi.mock('../helpers', () => ({
  buildRecallSystemMessage: mockBuildRecallSystemMessage,
}));

import {
  DebugSearch,
  createDebugSearch,
  type DebugSearchDeps,
  type DebugSearchIndexStateProvider,
} from './debug-search';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeIndexState(overrides: Partial<DebugSearchIndexStateProvider> = {}): any {
  return {
    getLastInitAt: vi.fn().mockReturnValue('2024-01-01T00:00:00.000Z'),
    getWorkspaceIndexState: vi.fn().mockResolvedValue({
      availableIndexes: ['forge_runtime_memory_recall'],
      activeIndexStats: { dimension: 384, count: 10, metric: 'cosine' },
    }),
    ...overrides,
  };
}

function makeOrchestrator(overrides: Partial<DebugSearchDeps['orchestrator']> = {}): any {
  return {
    resolveRecallConfig: vi.fn().mockResolvedValue({
      documentCount: 5,
      searchMode: 'hybrid',
      scoreThreshold: 0.5,
      graphRandomWalkSteps: 3,
      graphIncludeSources: true,
    }),
    runRecallSearch: vi.fn().mockResolvedValue({
      formatted: 'formatted context',
      results: [{ id: 'r1', content: 'r1 content' }],
      rawWorkspaceResults: [
        { id: 'r1', content: 'r1 content', score: 0.9 },
        { id: 'r2', content: 'r2 content', score: 0.6 },
      ],
      graph: {
        queryText: 'g1',
        dimension: 384,
        includeSources: true,
        hit: true,
        score: 0.8,
        context: 'graph context',
        relevantContextRaw: 'raw',
        sourcesCount: 2,
        sourcesJson: '{}',
        rawJson: '{}',
        error: null,
      },
      effectiveGraphTopK: 5,
      effectiveGraphThreshold: 0.5,
    }),
    ...overrides,
  };
}

function makeQueryVectorIndex(overrides: Partial<DebugSearchDeps['queryVectorIndex']> = {}): any {
  return vi.fn().mockResolvedValue([
    { id: 'v1', score: 0.95, text: 'v1 text', metadata: { foo: 'bar' } },
    { id: 'v2', score: 0.7, text: 'v2 text' },
  ]);
}

function makeDeps(overrides: Partial<DebugSearchDeps> = {}): any {
  return {
    indexState: makeIndexState(),
    orchestrator: makeOrchestrator(),
    workspaceEmbedder: 'ws_embedder_v1',
    queryVectorIndex: makeQueryVectorIndex(),
    ...overrides,
  };
}

beforeEach(() => {
  mockEmbedTextWithWorkspaceEmbedder.mockReset();
  mockEmbedTextWithWorkspaceEmbedder.mockResolvedValue([0.1, 0.2, 0.3]);
  mockBuildRecallSystemMessage.mockReset();
  mockBuildRecallSystemMessage.mockReturnValue('injected system message');
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('DebugSearch', () => {
  describe('search() with empty query', () => {
    it('returns stub result with empty arrays and null graph fields', async () => {
      const deps = makeDeps();
      const search = createDebugSearch(deps);
      const result = await search.search({ query: '' });

      expect(result.query).toBe('');
      expect(result.workspaceResults).toEqual([]);
      expect(result.vectorResults).toEqual([]);
      expect(result.graphHit).toBe(false);
      expect(result.graphQuery).toBe('');
      expect(result.graphContext).toBe('');
      expect(result.injectedSystemMessage).toBeNull();
    });

    it('does not call runRecallSearch or queryVectorIndex when query is empty', async () => {
      const deps = makeDeps();
      const search = createDebugSearch(deps);
      await search.search({ query: '' });
      expect(deps.orchestrator.runRecallSearch).not.toHaveBeenCalled();
      expect(deps.queryVectorIndex).not.toHaveBeenCalled();
    });

    it('trims whitespace and treats as empty', async () => {
      const deps = makeDeps();
      const search = createDebugSearch(deps);
      const result = await search.search({ query: '   ' });
      expect(result.query).toBe('');
      expect(deps.orchestrator.runRecallSearch).not.toHaveBeenCalled();
    });

    it('still reads lastInitAt and indexState even with empty query', async () => {
      const deps = makeDeps();
      const search = createDebugSearch(deps);
      const result = await search.search({ query: '' });
      expect(result.lastInitAt).toBe('2024-01-01T00:00:00.000Z');
      expect(deps.indexState.getWorkspaceIndexState).toHaveBeenCalledTimes(1);
    });
  });

  describe('search() with non-empty query', () => {
    it('calls runRecallSearch, embedder, queryVectorIndex in order', async () => {
      const deps = makeDeps();
      const search = createDebugSearch(deps);
      await search.search({ query: 'hello' });

      expect(deps.orchestrator.runRecallSearch).toHaveBeenCalledWith('hello', expect.any(Object));
      expect(mockEmbedTextWithWorkspaceEmbedder).toHaveBeenCalledWith('ws_embedder_v1', 'hello');
      expect(deps.queryVectorIndex).toHaveBeenCalledWith([0.1, 0.2, 0.3], 5); // 5 = recallConfig.documentCount
    });

    it('returns workspaceResults with relativePercent computed from highest score', async () => {
      const deps = makeDeps();
      const search = createDebugSearch(deps);
      const result = await search.search({ query: 'hello' });
      // Highest score: 0.9 (r1). r1 = 100%, r2 = (0.6/0.9)*100 ≈ 66.67
      expect(result.workspaceResults[0]).toMatchObject({
        id: 'r1',
        score: 0.9,
        relativePercent: 100,
      });
      expect(result.workspaceResults[1]).toMatchObject({
        id: 'r2',
        score: 0.6,
        relativePercent: expect.closeTo(66.67, 1),
      });
    });

    it('maps vectorResults to {id, score, metadataJson, document}', async () => {
      const deps = makeDeps();
      const search = createDebugSearch(deps);
      const result = await search.search({ query: 'hello' });
      expect(result.vectorResults).toEqual([
        {
          id: 'v1',
          score: 0.95,
          metadataJson: '{\n  "foo": "bar"\n}',
          document: 'v1 text',
        },
        {
          id: 'v2',
          score: 0.7,
          metadataJson: null,
          document: 'v2 text',
        },
      ]);
    });

    it('returns graph fields from runRecallSearch.graph', async () => {
      const deps = makeDeps();
      const search = createDebugSearch(deps);
      const result = await search.search({ query: 'hello' });
      expect(result.graphHit).toBe(true);
      expect(result.graphScore).toBe(0.8);
      expect(result.graphContext).toBe('graph context');
      expect(result.graphSourcesCount).toBe(2);
    });

    it('calls buildRecallSystemMessage with graphHit, score, context, query, results', async () => {
      const deps = makeDeps();
      const search = createDebugSearch(deps);
      const result = await search.search({ query: 'hello' });
      expect(mockBuildRecallSystemMessage).toHaveBeenCalledWith({
        graphHit: true,
        graphScore: 0.8,
        graphContext: 'graph context',
        query: 'hello',
        results: [{ id: 'r1', content: 'r1 content' }],
      });
      expect(result.injectedSystemMessage).toBe('injected system message');
    });

    it('returns queryEmbedding and queryEmbeddingDimension from embedder', async () => {
      const deps = makeDeps();
      mockEmbedTextWithWorkspaceEmbedder.mockResolvedValue([0.5, 0.6]);
      const search = createDebugSearch(deps);
      const result = await search.search({ query: 'hello' });
      expect(result.queryEmbedding).toEqual([0.5, 0.6]);
      expect(result.queryEmbeddingDimension).toBe(2);
    });
  });

  describe('lastInitAt and indexState', () => {
    it('returns lastInitAt from indexState', async () => {
      const indexState = makeIndexState({
        getLastInitAt: vi.fn().mockReturnValue(null),
      });
      const deps = makeDeps({ indexState });
      const search = createDebugSearch(deps);
      const result = await search.search({ query: 'hello' });
      expect(result.lastInitAt).toBeNull();
    });

    it('returns availableIndexes and activeIndexStats from indexState', async () => {
      const deps = makeDeps();
      const search = createDebugSearch(deps);
      const result = await search.search({ query: 'hello' });
      expect(result.availableIndexes).toEqual(['forge_runtime_memory_recall']);
      expect(result.activeIndexStats).toEqual({ dimension: 384, count: 10, metric: 'cosine' });
    });
  });

  describe('class instantiation', () => {
    it('can be instantiated via factory', () => {
      const search = createDebugSearch(makeDeps());
      expect(search).toBeInstanceOf(DebugSearch);
    });

    it('can be instantiated via constructor', () => {
      const search = new DebugSearch(makeDeps());
      expect(search).toBeInstanceOf(DebugSearch);
    });
  });
});
