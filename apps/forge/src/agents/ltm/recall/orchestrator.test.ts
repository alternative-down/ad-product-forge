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

/**
 * Settings override used by the consumption tests (issue #5484).
 *
 * Each of the 3 dropped fields is set to a value distinct from the field
 * that the old code would have used as a fallback:
 *   - `ltmRecallWorkspaceTopK: 11` — old code used `ltmRecallDocumentCount: 7`
 *   - `ltmRecallGraphTopK: 8` — old code used `ltmRecallDocumentCount: 7`
 *   - `ltmRecallGraphThreshold: 0.42` — old code used `ltmRecallScoreThreshold: 0.3`
 *
 * Before the fix, the assertions on workspaceSearch.topK=11, graphSearch.topK=8,
 * graphSearch.threshold=0.42 all fail. After the fix they pass.
 */
const consumptionSettings = {
  ...baseSettings,
  ltmRecallWorkspaceTopK: 11,
  ltmRecallGraphTopK: 8,
  ltmRecallGraphThreshold: 0.42,
  ltmRecallScoreThreshold: 0.3,
  ltmRecallDocumentCount: 7,
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
        workspaceTopK: 5,
        graphTopK: 5,
        graphThreshold: 0.5,
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
        workspaceTopK: 7,
        graphTopK: 3,
        graphThreshold: 0.5,
        scoreThreshold: 0.5,
        documentCount: 99, // intentionally distinct from workspaceTopK to prove field mapping
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
        workspaceTopK: 7,
        graphTopK: 3,
        graphThreshold: 0.5,
        scoreThreshold: 0.5,
        documentCount: 3,
        graphRandomWalkSteps: 3,
        graphIncludeSources: true,
      });

      expect(out.formatted).toBe('a\nfirst\n\nb\nsecond');
      expect(out.graph.hit).toBe(false);
    });

    /**
     * Consumption test #1 (issue #5484):
     * `ltmRecallWorkspaceTopK` is plumbed through to `runWorkspaceSearch` as `topK`.
     * Before the fix, the orchestrator used `config.documentCount` (= 7) instead of
     * `config.workspaceTopK` (= 11).
     */
    it('plumbs ltmRecallWorkspaceTopK to runWorkspaceSearch.topK (#5484)', async () => {
      const deps = createMockDeps({ settings: consumptionSettings });
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
        workspaceTopK: consumptionSettings.ltmRecallWorkspaceTopK,
        graphTopK: consumptionSettings.ltmRecallGraphTopK,
        graphThreshold: consumptionSettings.ltmRecallGraphThreshold,
        scoreThreshold: consumptionSettings.ltmRecallScoreThreshold,
        documentCount: consumptionSettings.ltmRecallDocumentCount,
        graphRandomWalkSteps: consumptionSettings.ltmRecallGraphRandomWalkSteps,
        graphIncludeSources: consumptionSettings.ltmRecallGraphIncludeSources,
      });

      const workspaceCall = (runWorkspaceSearch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(workspaceCall?.[1]).toMatchObject({
        topK: 11, // ltmRecallWorkspaceTopK
        resultCount: 7, // ltmRecallDocumentCount
        mode: 'vector',
      });
    });

    /**
     * Consumption test #2 (issue #5484):
     * `ltmRecallGraphTopK` is plumbed through to `runGraphSearch` as `topK`.
     * Before the fix, the orchestrator used `config.documentCount` (= 7) instead
     * of `config.graphTopK` (= 8).
     */
    it('plumbs ltmRecallGraphTopK to runGraphSearch.topK (#5484)', async () => {
      const deps = createMockDeps({ settings: consumptionSettings });
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
        workspaceTopK: consumptionSettings.ltmRecallWorkspaceTopK,
        graphTopK: consumptionSettings.ltmRecallGraphTopK,
        graphThreshold: consumptionSettings.ltmRecallGraphThreshold,
        scoreThreshold: consumptionSettings.ltmRecallScoreThreshold,
        documentCount: consumptionSettings.ltmRecallDocumentCount,
        graphRandomWalkSteps: consumptionSettings.ltmRecallGraphRandomWalkSteps,
        graphIncludeSources: consumptionSettings.ltmRecallGraphIncludeSources,
      });

      const graphCall = (runGraphSearch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(graphCall?.[2]).toMatchObject({
        topK: 8, // ltmRecallGraphTopK
      });
    });

    /**
     * Consumption test #3 (issue #5484):
     * `ltmRecallGraphThreshold` is plumbed through to `runGraphSearch` as `threshold`.
     * Before the fix, the orchestrator used `config.scoreThreshold` (= 0.3) instead
     * of `config.graphThreshold` (= 0.42).
     */
    it('plumbs ltmRecallGraphThreshold to runGraphSearch.threshold (#5484)', async () => {
      const deps = createMockDeps({ settings: consumptionSettings });
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
        workspaceTopK: consumptionSettings.ltmRecallWorkspaceTopK,
        graphTopK: consumptionSettings.ltmRecallGraphTopK,
        graphThreshold: consumptionSettings.ltmRecallGraphThreshold,
        scoreThreshold: consumptionSettings.ltmRecallScoreThreshold,
        documentCount: consumptionSettings.ltmRecallDocumentCount,
        graphRandomWalkSteps: consumptionSettings.ltmRecallGraphRandomWalkSteps,
        graphIncludeSources: consumptionSettings.ltmRecallGraphIncludeSources,
      });

      const graphCall = (runGraphSearch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(graphCall?.[2]).toMatchObject({
        threshold: 0.42, // ltmRecallGraphThreshold
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
