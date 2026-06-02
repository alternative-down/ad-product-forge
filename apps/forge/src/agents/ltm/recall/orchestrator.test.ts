/**
 * Unit tests for agents/ltm/recall/orchestrator.ts
 *
 * Covers: RecallOrchestrator class
 *  - resolveRecallConfig reads from readRuntimeMemorySettings
 *  - Throws when readRuntimeMemorySettings is missing or returns null
 *  - searchWorkspace delegates to runWorkspaceSearch with correct deps
 *  - searchGraph delegates to runGraphSearch with correct deps
 *  - runRecallSearch combines workspace + graph results and formats
 *
 * The runWorkspaceSearch and runGraphSearch collaborators are mocked at the
 * module boundary so we test the orchestrator's wiring logic.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./workspace-search', () => ({
  runWorkspaceSearch: vi.fn(),
}));
vi.mock('./graph-search', () => ({
  runGraphSearch: vi.fn(),
}));

import {
  RecallOrchestrator,
  createRecallOrchestrator,
  type RecallOrchestratorDeps,
} from './orchestrator';
import type { RecallConfig } from './types';
import { runWorkspaceSearch } from './workspace-search';
import { runGraphSearch } from './graph-search';

const baseSettings = {
  ltmRecallSearchMode: 'hybrid' as const,
  ltmRecallWorkspaceTopK: 5,
  ltmRecallGraphTopK: 5,
  ltmRecallGraphThreshold: 0.5,
  ltmRecallGraphRandomWalkSteps: 3,
  ltmRecallGraphIncludeSources: true,
  ltmRecallScoreThreshold: 0.7,
  ltmRecallDocumentCount: 4,
};

function createMockDeps(opts: { settings?: typeof baseSettings | null; stats?: { activeIndexStats?: { dimension?: number } } } = {}): RecallOrchestratorDeps {
  return {
    retrievalWorkspace: {
      queryVector: vi.fn(),
      search: vi.fn(),
      searchGraph: vi.fn(),
      getStats: vi.fn().mockResolvedValue(opts.stats ?? { activeIndexStats: { dimension: 256 } }),
    } as never,
    agentId: 'agent-orchestrator',
    agentWorkspacePath: '/tmp/agent',
    agentMemoryPath: '/tmp/agent/memory',
    workspaceEmbedder: 'openai-3-small',
    readRuntimeMemorySettings: opts.settings === null
      ? undefined
      : vi.fn().mockResolvedValue(opts.settings ?? baseSettings),
    recallTimeoutMs: 5000,
    runTrackedRecallOperation: vi.fn() as never,
  };
}

describe('RecallOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveRecallConfig', () => {
    it('maps runtime settings to RecallConfig', async () => {
      const deps = createMockDeps();
      const orch = new RecallOrchestrator(deps);

      const config = await orch.resolveRecallConfig();

      expect(config).toEqual<RecallConfig>({
        searchMode: 'hybrid',
        scoreThreshold: 0.7,
        documentCount: 4,
        graphRandomWalkSteps: 3,
        graphIncludeSources: true,
      });
    });

    it('throws when readRuntimeMemorySettings is not provided', async () => {
      const deps = createMockDeps({ settings: null });
      const orch = new RecallOrchestrator(deps);

      await expect(orch.resolveRecallConfig()).rejects.toThrow(
        'LTM recall requires runtime memory settings',
      );
    });
  });

  describe('searchWorkspace', () => {
    it('delegates to runWorkspaceSearch with the agentId and timeout', async () => {
      const deps = createMockDeps();
      const orch = new RecallOrchestrator(deps);
      (runWorkspaceSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
        formatted: '',
        results: [],
      });

      await orch.searchWorkspace('q', {
        topK: 3,
        resultCount: 2,
        scoreThreshold: 0.4,
        mode: 'vector',
      });

      expect(runWorkspaceSearch).toHaveBeenCalledWith(
        'q',
        { topK: 3, resultCount: 2, scoreThreshold: 0.4, mode: 'vector' },
        expect.objectContaining({
          agentId: 'agent-orchestrator',
          recallTimeoutMs: 5000,
        }),
      );
    });

    it('uses defaults when called without options', async () => {
      const deps = createMockDeps();
      const orch = new RecallOrchestrator(deps);
      (runWorkspaceSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
        formatted: '',
        results: [],
      });

      await orch.searchWorkspace('q');

      const callArgs = (runWorkspaceSearch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs?.[1]).toEqual({
        topK: 1,
        resultCount: 1,
        scoreThreshold: 0,
        mode: 'hybrid',
      });
    });
  });

  describe('searchGraph', () => {
    it('delegates to runGraphSearch with bound getGraphDimension', async () => {
      const deps = createMockDeps();
      const orch = new RecallOrchestrator(deps);
      (runGraphSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
        queryText: 'q',
        dimension: 256,
        includeSources: true,
        hit: true,
        score: 0.9,
        context: '',
        relevantContextRaw: null,
        sourcesCount: 0,
        sourcesJson: null,
        rawJson: null,
        error: null,
      });

      await orch.searchGraph('q', [], {
        topK: 5,
        threshold: 0.5,
        randomWalkSteps: 3,
        includeSources: true,
        contextResults: [],
      });

      expect(runGraphSearch).toHaveBeenCalledWith(
        'q',
        [],
        expect.objectContaining({ topK: 5, threshold: 0.5, includeSources: true }),
        expect.objectContaining({
          agentId: 'agent-orchestrator',
          getGraphDimension: expect.any(Function),
        }),
      );
    });
  });

  describe('runRecallSearch', () => {
    it('returns formatted="" when graph search hits', async () => {
      const deps = createMockDeps();
      const orch = new RecallOrchestrator(deps);
      (runWorkspaceSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
        formatted: '',
        results: [
          { id: 'a', content: 'first', score: 0.9 },
          { id: 'b', content: 'second', score: 0.7 },
        ],
      });
      (runGraphSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
        queryText: 'q',
        dimension: 256,
        includeSources: true,
        hit: true,
        score: 0.9,
        context: 'graph-context',
        relevantContextRaw: null,
        sourcesCount: 0,
        sourcesJson: null,
        rawJson: null,
        error: null,
      });

      const out = await orch.runRecallSearch('q', {
        searchMode: 'hybrid',
        scoreThreshold: 0.5,
        documentCount: 3,
        graphRandomWalkSteps: 3,
        graphIncludeSources: true,
      });

      expect(out.formatted).toBe('');
      expect(out.results).toHaveLength(2);
      expect(out.graph.hit).toBe(true);
      expect(out.effectiveGraphTopK).toBe(3);
      expect(out.effectiveGraphThreshold).toBe(0.5);
    });

    it('returns formatted workspace content when graph search misses', async () => {
      const deps = createMockDeps();
      const orch = new RecallOrchestrator(deps);
      (runWorkspaceSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
        formatted: '',
        results: [
          { id: 'a', content: 'first', score: 0.9 },
          { id: 'b', content: 'second', score: 0.7 },
        ],
      });
      (runGraphSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
        queryText: 'q',
        dimension: 256,
        includeSources: true,
        hit: false,
        score: null,
        context: '',
        relevantContextRaw: null,
        sourcesCount: 0,
        sourcesJson: null,
        rawJson: null,
        error: null,
      });

      const out = await orch.runRecallSearch('q', {
        searchMode: 'hybrid',
        scoreThreshold: 0.5,
        documentCount: 3,
        graphRandomWalkSteps: 3,
        graphIncludeSources: true,
      });

      expect(out.formatted).toBe('a\nfirst\n\nb\nsecond');
      expect(out.graph.hit).toBe(false);
    });

    it('passes config.documentCount as workspace topK and resultCount', async () => {
      const deps = createMockDeps();
      const orch = new RecallOrchestrator(deps);
      (runWorkspaceSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
        formatted: '',
        results: [],
      });
      (runGraphSearch as ReturnType<typeof vi.fn>).mockResolvedValue({
        queryText: '',
        dimension: 0,
        includeSources: false,
        hit: false,
        score: null,
        context: '',
        relevantContextRaw: null,
        sourcesCount: 0,
        sourcesJson: null,
        rawJson: null,
        error: null,
      });

      await orch.runRecallSearch('q', {
        searchMode: 'vector',
        scoreThreshold: 0.3,
        documentCount: 7,
        graphRandomWalkSteps: 2,
        graphIncludeSources: false,
      });

      const workspaceCall = (runWorkspaceSearch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(workspaceCall?.[1]).toMatchObject({
        topK: 7,
        resultCount: 7,
        mode: 'vector',
      });
    });
  });

  describe('createRecallOrchestrator factory', () => {
    it('returns a RecallOrchestrator instance', () => {
      const deps = createMockDeps();
      const instance = createRecallOrchestrator(deps);
      expect(instance).toBeInstanceOf(RecallOrchestrator);
    });
  });
});
