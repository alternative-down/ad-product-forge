import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

import {
  type CheckpointedOmStateStore,
  embedTextWithWorkspaceEmbedder,
  FilesystemDocumentSource,
  forgeDebug,
  SqliteWorkspaceRetrieval,
  type WorkspaceEmbedderId,
} from '@forge-runtime/core';

import type {
  LongTermMemoryRecallHistory,
  LongTermMemoryRecallSnapshot,
  createAgentLongTermMemoryStore,
} from './agent-long-term-memory-store';

type SearchResult = {
  id: string;
  content: string;
  score?: number;
};

export type AgentLongTermMemoryRecallDebugSearchInput = {
  query: string;
};

export type AgentLongTermMemoryRecallDebugSearchResult = {
  query: string;
  topK: number;
  searchMode: 'hybrid' | 'vector' | 'bm25';
  graphTopK: number;
  graphThreshold: number;
  graphRandomWalkSteps: number;
  lastInitAt: string | null;
  workspaceCanBm25: boolean;
  workspaceCanVector: boolean;
  workspaceCanHybrid: boolean;
  availableIndexes: string[];
  activeIndexName: string;
  activeIndexStats: {
    dimension: number;
    count: number;
    metric: string | null;
  } | null;
  queryEmbedding: number[];
  queryEmbeddingDimension: number;
  workspaceFormattedContext: string;
  workspaceResults: Array<{
    id: string;
    content: string;
    score: number | null;
    relativePercent: number | null;
  }>;
  vectorResults: Array<{
    id: string;
    score: number;
    metadataJson: string | null;
    document: string | null;
  }>;
  graphHit: boolean;
  graphQuery: string;
  graphDimension: number;
  graphIncludeSources: boolean;
  graphContext: string;
  graphRelevantContextRaw: string | null;
  graphSourcesCount: number;
  graphSourcesJson: string | null;
  graphRawJson: string | null;
  graphError: string | null;
  injectedSystemMessage: string | null;
};

const RECALL_AUTO_INDEX_PATHS = [
  'memory',
] as const;
const RECALL_SEARCH_MODE = 'hybrid' as const;
const RECALL_DOCUMENT_COUNT = 3;
const RECALL_SCORE_THRESHOLD = 0.7;
const RECALL_GRAPH_TOP_K = 3;
const RECALL_GRAPH_RANDOM_WALK_STEPS = 100;
const RECALL_GRAPH_INCLUDE_SOURCES = false;

type RecallConfig = {
  searchMode: 'hybrid' | 'vector' | 'bm25';
  scoreThreshold: number;
  documentCount: number;
  graphTopK: number;
  graphThreshold: number;
  graphRandomWalkSteps: number;
  graphIncludeSources: boolean;
};

async function countFiles(rootPath: string, relativePath: string): Promise<number> {
  const absolutePath = path.resolve(rootPath, relativePath.replace(/^\//, ''));
  const entries = await fs.readdir(absolutePath, { withFileTypes: true }).catch(() => null);

  if (!entries) {
    return 0;
  }

  let total = 0;

  for (const entry of entries) {
    if (entry.isFile()) {
      total += 1;
      continue;
    }

    if (!entry.isDirectory()) {
      continue;
    }

    total += await countFiles(rootPath, path.posix.join(relativePath, entry.name));
  }

  return total;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
) {
  let timeoutId: NodeJS.Timeout | null = null;

  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        onTimeout?.();
        reject(new Error(message));
      }, timeoutMs);
    }),
  ]).finally(() => {
    if (!timeoutId) {
      return;
    }

    clearTimeout(timeoutId);
  });
}

export class AgentLongTermMemoryRecall {
  private readonly initTimeoutMs = 5 * 60_000;
  private readonly recallTimeoutMs = 60_000;
  private readonly agentId: string;
  private readonly retrievalWorkspace: SqliteWorkspaceRetrieval;
  private readonly agentMemoryPath: string;
  private readonly agentWorkspacePath: string;
  private readonly workspaceEmbedder: WorkspaceEmbedderId;
  private readonly recallConfig: RecallConfig;
  private readonly readRuntimeMemorySettings?: () => Promise<{
    ltmRecallSearchMode: 'hybrid' | 'vector' | 'bm25';
    ltmRecallGraphTopK: number;
    ltmRecallGraphThreshold: number;
    ltmRecallGraphRandomWalkSteps: number;
    ltmRecallGraphIncludeSources: boolean;
    ltmRecallScoreThreshold: number;
    ltmRecallDocumentCount: number;
  }>;
  private readonly checkpointedOmStateStore: CheckpointedOmStateStore & {
    readState(): Promise<{
      latestMetrics?: {
        recentRawMessageCount?: number;
      } | null;
    }>;
  };
  private readonly persistenceStore: ReturnType<typeof createAgentLongTermMemoryStore>;
  private workspaceInitialized = false;
  private lastIndexedStamp: string | null = null;
  private lastInitAt: string | null = null;
  private pendingRecallOperationCount = 0;
  private lingeringRecallOperationSince: number | null = null;

  constructor(input: {
    agentId: string;
    agentWorkspacePath: string;
    agentMemoryPath: string;
    mastraId: string;
    workspaceEmbedder?: WorkspaceEmbedderId;
    scoreThreshold?: number;
    documentCount?: number;
    readRuntimeMemorySettings?: () => Promise<{
      ltmRecallSearchMode: 'hybrid' | 'vector' | 'bm25';
      ltmRecallGraphTopK: number;
      ltmRecallGraphThreshold: number;
      ltmRecallGraphRandomWalkSteps: number;
      ltmRecallGraphIncludeSources: boolean;
      ltmRecallScoreThreshold: number;
      ltmRecallDocumentCount: number;
    }>;
    checkpointedOmStateStore: CheckpointedOmStateStore & {
      readState(): Promise<{
        latestMetrics?: {
          recentRawMessageCount?: number;
        } | null;
      }>;
    };
    persistenceStore: ReturnType<typeof createAgentLongTermMemoryStore>;
    model?: unknown;
  }) {
    this.agentId = input.agentId;
    this.agentMemoryPath = input.agentMemoryPath;
    this.agentWorkspacePath = input.agentWorkspacePath;
    this.workspaceEmbedder = input.workspaceEmbedder ?? 'fastembed';
    this.recallConfig = {
      searchMode: RECALL_SEARCH_MODE,
      scoreThreshold: input.scoreThreshold ?? RECALL_SCORE_THRESHOLD,
      documentCount: input.documentCount ?? RECALL_DOCUMENT_COUNT,
      graphTopK: RECALL_GRAPH_TOP_K,
      graphThreshold: input.scoreThreshold ?? RECALL_SCORE_THRESHOLD,
      graphRandomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
      graphIncludeSources: RECALL_GRAPH_INCLUDE_SOURCES,
    };
    this.readRuntimeMemorySettings = input.readRuntimeMemorySettings;
    this.checkpointedOmStateStore = input.checkpointedOmStateStore;
    this.persistenceStore = input.persistenceStore;
    this.retrievalWorkspace = new SqliteWorkspaceRetrieval({
      databasePath: path.resolve(input.agentWorkspacePath, `${input.agentId}-memory-recall.db`),
      source: new FilesystemDocumentSource({
        roots: [
          path.resolve(input.agentMemoryPath, 'memory'),
        ],
      }),
      embedder: {
        embed: async ({ texts }: { texts: string[] }) => ({
          vectors: await Promise.all(texts.map((text: string) =>
            embedTextWithWorkspaceEmbedder(this.workspaceEmbedder, text))),
        }),
      },
    });
  }

  async recallFromStep(input: {
    step: unknown;
    steps: unknown[];
    threadId: string | null;
    resourceId?: string;
  }) {
    const recallStartedAt = Date.now();

    try {
      if (this.pendingRecallOperationCount > 0) {
        forgeDebug('ltm', 'ltm recall skipped because a prior recall operation is still in flight', {
          agentId: this.agentId,
          threadId: input.threadId,
          pendingRecallOperationCount: this.pendingRecallOperationCount,
          lingeringRecallOperationSince: this.lingeringRecallOperationSince
            ? new Date(this.lingeringRecallOperationSince).toISOString()
            : null,
        });
        return null;
      }

      forgeDebug('ltm', 'ltm recall step start', {
        agentId: this.agentId,
        threadId: input.threadId,
        resourceId: input.resourceId ?? null,
      });
      const queryText = this.buildRecallQueryFromStep(input.step);

      if (!queryText) {
        await this.clearPersistedRecallState();
        return null;
      }

      const recallConfig = await this.resolveRecallConfig();
      const recallThreadState = await this.readRecallThreadState(input.threadId);
      const recallSearch = await this.runRecallSearch(queryText, recallConfig);
      const { results, graph, candidateFingerprints } = this.dedupeRecallResults({
        graph: recallSearch.graph,
        results: recallSearch.results,
        recentFingerprints: recallThreadState.recentFingerprints,
      });
      const recallText = buildRecallSystemMessage({
        graphHit: graph.hit,
        graphContext: graph.context,
        query: queryText,
        results,
      });

      if (!recallText) {
        await this.clearPersistedRecallState();
        return null;
      }

      const indexStats = await this.getIndexStats();
      await this.persistRecallSnapshot({
        threadId: input.threadId,
        resourceId: input.resourceId,
      }, {
        status: 'hit',
        query: queryText,
        resultIds: graph.hit ? [] : results.map((result) => result.id),
        resultCount: graph.hit ? 0 : results.length,
        resultScores: graph.hit ? [] : results.map((result) => result.score ?? 0),
        graphHit: graph.hit,
        stepsJson: safeSerializeRecallSteps(input.steps),
        updatedAt: new Date().toISOString(),
        lastInitAt: this.lastInitAt,
        searchMode: recallConfig.searchMode,
        topK: recallConfig.documentCount,
        graphTopK: recallConfig.graphTopK,
        graphThreshold: recallConfig.graphThreshold,
        graphRandomWalkSteps: recallConfig.graphRandomWalkSteps,
        indexPaths: [...RECALL_AUTO_INDEX_PATHS],
        workspaceFileCount: indexStats.workspaceFileCount,
        memoryFileCount: indexStats.memoryFileCount,
        checkpointFileCount: indexStats.checkpointFileCount,
        error: null,
      }, this.buildNextRecallHistory({
        recentFingerprints: recallThreadState.recentFingerprints,
        candidateFingerprints,
        windowSize: recallThreadState.windowSize,
      }));

      forgeDebug('ltm', 'ltm recall step complete', {
        agentId: this.agentId,
        threadId: input.threadId,
        durationMs: Date.now() - recallStartedAt,
        graphHit: graph.hit,
        resultCount: graph.hit ? 0 : results.length,
      });

      return recallText;
    } catch (error) {
      console.error('[AgentLongTermMemoryRecall] recall failed:', error);
      forgeDebug('ltm', 'ltm recall step failed', {
        agentId: this.agentId,
        threadId: input.threadId,
        durationMs: Date.now() - recallStartedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      await this.clearPersistedRecallState();
      return null;
    }
  }

  async dispose() {
    this.retrievalWorkspace.dispose();
  }

  async initialize() {
    if (this.workspaceInitialized) {
      return;
    }

    const stageStartedAt = Date.now();
    const currentStamp = await this.readCurrentIndexStamp();

    forgeDebug('ltm', 'ltm recall workspace init start', {
      agentId: this.agentId,
      stamp: currentStamp,
    });
    await this.runTrackedRecallOperation(
      'retrieval.refresh',
      this.retrievalWorkspace.refresh(),
      this.initTimeoutMs,
      'ltm recall retrieval init timed out',
    );
    this.workspaceInitialized = true;
    this.lastIndexedStamp = currentStamp;
    this.lastInitAt = new Date().toISOString();
    forgeDebug('ltm', 'ltm recall workspace init complete', {
      agentId: this.agentId,
      durationMs: Date.now() - stageStartedAt,
      stamp: currentStamp,
    });
  }

  async refreshIndex() {
    await this.initialize();
    const stageStartedAt = Date.now();
    const currentStamp = await this.readCurrentIndexStamp();

    if (currentStamp === this.lastIndexedStamp) {
      forgeDebug('ltm', 'ltm recall workspace index unchanged', {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        stamp: currentStamp,
      });
      return;
    }

    forgeDebug('ltm', 'ltm recall workspace reindex start', {
      agentId: this.agentId,
      previousStamp: this.lastIndexedStamp,
      nextStamp: currentStamp,
    });
    await this.runTrackedRecallOperation(
      'retrieval.refresh',
      this.retrievalWorkspace.refresh(),
      this.initTimeoutMs,
      'ltm recall retrieval refresh timed out',
    );
    this.lastIndexedStamp = currentStamp;
    this.lastInitAt = new Date().toISOString();
    forgeDebug('ltm', 'ltm recall workspace reindex complete', {
      agentId: this.agentId,
      durationMs: Date.now() - stageStartedAt,
      stamp: currentStamp,
    });
  }

  async debugSearch(input: AgentLongTermMemoryRecallDebugSearchInput) {
    const indexState = await this.getWorkspaceIndexState();
    const query = input.query.trim();
    const recallConfig = await this.resolveRecallConfig();

    if (!query) {
      return {
        query: '',
        topK: recallConfig.documentCount,
        searchMode: recallConfig.searchMode,
        graphTopK: recallConfig.graphTopK,
        graphThreshold: recallConfig.graphThreshold,
        graphRandomWalkSteps: recallConfig.graphRandomWalkSteps,
        lastInitAt: this.lastInitAt,
        workspaceCanBm25: true,
        workspaceCanVector: true,
        workspaceCanHybrid: true,
        availableIndexes: indexState.availableIndexes,
        activeIndexName: 'forge_runtime_memory_recall',
        activeIndexStats: indexState.activeIndexStats,
        queryEmbedding: [],
        queryEmbeddingDimension: 0,
        workspaceFormattedContext: '',
        workspaceResults: [],
        vectorResults: [],
        graphHit: false,
        graphQuery: '',
        graphDimension: 0,
        graphIncludeSources: recallConfig.graphIncludeSources,
        graphContext: '',
        graphRelevantContextRaw: null,
        graphSourcesCount: 0,
        graphSourcesJson: null,
        graphRawJson: null,
        graphError: null,
        injectedSystemMessage: null,
      } satisfies AgentLongTermMemoryRecallDebugSearchResult;
    }

    const recallSearch = await this.runRecallSearch(query, recallConfig);
    const queryEmbedding = await embedTextWithWorkspaceEmbedder(this.workspaceEmbedder, query);
    const {
      formatted: workspaceFormattedContext,
      results,
      rawWorkspaceResults,
      graph: graphSearch,
    } = recallSearch;
    const vectorResults = await this.queryVectorIndex(
      queryEmbedding,
      Math.max(recallConfig.documentCount, recallConfig.graphTopK),
    );
    const highestScore = rawWorkspaceResults.reduce((currentMax, result) => {
      const score = typeof result.score === 'number' ? result.score : 0;
      return Math.max(currentMax, score);
    }, 0);

    return {
      query,
      topK: recallConfig.documentCount,
      searchMode: recallConfig.searchMode,
      graphTopK: recallConfig.graphTopK,
      graphThreshold: recallConfig.graphThreshold,
      graphRandomWalkSteps: recallConfig.graphRandomWalkSteps,
      lastInitAt: this.lastInitAt,
      workspaceCanBm25: true,
      workspaceCanVector: true,
      workspaceCanHybrid: true,
      availableIndexes: indexState.availableIndexes,
      activeIndexName: 'forge_runtime_memory_recall',
      activeIndexStats: indexState.activeIndexStats,
      queryEmbedding,
      queryEmbeddingDimension: queryEmbedding.length,
      workspaceFormattedContext,
      workspaceResults: rawWorkspaceResults.map((result) => ({
        id: result.id,
        content: result.content,
        score: typeof result.score === 'number' ? result.score : null,
        relativePercent: (
          typeof result.score === 'number'
          && highestScore > 0
        )
          ? (result.score / highestScore) * 100
          : null,
      })),
      vectorResults: vectorResults.map((result: {
        id: string;
        score: number;
        metadata?: Record<string, unknown>;
        text: string;
      }) => ({
        id: result.id,
        score: result.score,
        metadataJson: result.metadata ? JSON.stringify(result.metadata, null, 2) : null,
        document: result.text,
      })),
      graphHit: graphSearch.hit,
      graphQuery: graphSearch.queryText,
      graphDimension: graphSearch.dimension,
      graphIncludeSources: graphSearch.includeSources,
      graphContext: graphSearch.context,
      graphRelevantContextRaw: graphSearch.relevantContextRaw,
      graphSourcesCount: graphSearch.sourcesCount,
      graphSourcesJson: graphSearch.sourcesJson,
      graphRawJson: graphSearch.rawJson,
      graphError: graphSearch.error,
      injectedSystemMessage: buildRecallSystemMessage({
        graphHit: graphSearch.hit,
        graphContext: graphSearch.context,
        query,
        results,
      }),
    } satisfies AgentLongTermMemoryRecallDebugSearchResult;
  }

  private async runRecallSearch(queryText: string, config: RecallConfig) {
    const workspaceSearch = await this.searchWorkspace(queryText, {
      topK: Math.max(config.documentCount, config.graphTopK),
      mode: config.searchMode,
    });
    const filteredWorkspaceResults = this.filterWorkspaceFallbackResults(
      workspaceSearch.results,
      config.scoreThreshold,
      config.documentCount,
    );
    const graphSearch = await this.searchGraph(queryText, workspaceSearch.results, {
      topK: config.graphTopK,
      threshold: config.graphThreshold,
      randomWalkSteps: config.graphRandomWalkSteps,
      includeSources: config.graphIncludeSources,
      contextResults: filteredWorkspaceResults,
    });
    const workspaceFormattedContext = filteredWorkspaceResults
      .map((result) => `${result.id}\n${result.content}`)
      .join('\n\n');

    return {
      formatted: graphSearch.hit ? '' : workspaceFormattedContext,
      results: filteredWorkspaceResults,
      rawWorkspaceResults: workspaceSearch.results,
      graph: graphSearch,
    };
  }

  private async resolveRecallConfig() {
    const runtimeSettings = await this.readRuntimeMemorySettings?.();

    if (!runtimeSettings) {
      return this.recallConfig;
    }

    return {
      searchMode: runtimeSettings.ltmRecallSearchMode,
      scoreThreshold: runtimeSettings.ltmRecallScoreThreshold,
      documentCount: runtimeSettings.ltmRecallDocumentCount,
      graphTopK: runtimeSettings.ltmRecallGraphTopK,
      graphThreshold: runtimeSettings.ltmRecallGraphThreshold,
      graphRandomWalkSteps: runtimeSettings.ltmRecallGraphRandomWalkSteps,
      graphIncludeSources: runtimeSettings.ltmRecallGraphIncludeSources,
    } satisfies RecallConfig;
  }

  private async readCurrentIndexStamp() {
    return this.persistenceStore.readRecallIndexStamp();
  }

  private async searchWorkspace(
    queryText: string,
    options: {
      topK: number;
      mode: 'hybrid' | 'vector' | 'bm25';
    } = {
      topK: RECALL_DOCUMENT_COUNT,
      mode: RECALL_SEARCH_MODE,
    },
  ): Promise<{ formatted: string; results: SearchResult[] }> {
    const stageStartedAt = Date.now();

    try {
      forgeDebug('ltm', 'ltm recall workspace search start', {
        agentId: this.agentId,
        queryLength: queryText.length,
        topK: options.topK,
        mode: options.mode,
      });
      const results = await this.runTrackedRecallOperation<Array<{
        id: string;
        text: string;
        score: number;
        metadata?: Record<string, unknown>;
      }>>(
        'retrieval.search',
        this.retrievalWorkspace.search(queryText, {
          topK: options.topK,
          mode: options.mode,
        }),
        this.recallTimeoutMs,
        'ltm recall retrieval search timed out',
      );

      if (results.length === 0) {
        return { formatted: '', results: [] };
      }

      const searchResults: SearchResult[] = results.map((result) => ({
        id: result.id,
        content: result.text.trim(),
        score: result.score,
      }));
      forgeDebug('ltm', 'ltm recall workspace search complete', {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        resultCount: searchResults.length,
      });
      return { formatted: '', results: searchResults };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('SQLITE_ERROR: no such table') || message.includes('no such table:')) {
        return { formatted: '', results: [] };
      }

      forgeDebug('ltm', 'ltm recall workspace search failed', {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        error: message,
      });
      throw error;
    }
  }

  private async searchGraph(
    queryText: string,
    workspaceResults: SearchResult[],
    options: {
      topK: number;
      threshold: number;
      randomWalkSteps: number;
      includeSources: boolean;
      contextResults: SearchResult[];
    } = {
      topK: RECALL_GRAPH_TOP_K,
      threshold: RECALL_SCORE_THRESHOLD,
      randomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
      includeSources: RECALL_GRAPH_INCLUDE_SOURCES,
      contextResults: [],
    },
  ): Promise<{
    queryText: string;
    dimension: number;
    includeSources: boolean;
    hit: boolean;
    context: string;
    relevantContextRaw: string | null;
    sourcesCount: number;
    sourcesJson: string | null;
    rawJson: string | null;
    error: string | null;
  }> {
    const stageStartedAt = Date.now();
    const workspaceContextBase = options.contextResults.length > 0
      ? options.contextResults
      : workspaceResults;
    const workspaceContext = workspaceContextBase
      .map((result) => result.content)
      .filter(Boolean)
      .join('\n');
    const graphQueryText = workspaceContext ? `${queryText}\nContext: ${workspaceContext}` : queryText;
    const graphDimension = await this.getGraphDimension();

    try {
      const result = await this.runTrackedRecallOperation(
        'retrieval.graph',
        this.retrievalWorkspace.searchGraph({
          query: graphQueryText,
          topK: options.topK,
          threshold: options.threshold,
          randomWalkSteps: options.randomWalkSteps,
          includeSources: options.includeSources,
        }),
        this.recallTimeoutMs,
        'ltm recall graph search timed out',
      );

      forgeDebug('ltm', 'ltm recall graph search complete', {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        hit: result.hit,
        sourcesCount: result.sourcesCount,
      });

      return {
        queryText: graphQueryText,
        dimension: graphDimension,
        includeSources: options.includeSources,
        hit: result.hit,
        context: result.context,
        relevantContextRaw: result.relevantContextRaw,
        sourcesCount: result.sourcesCount,
        sourcesJson: result.sourcesJson,
        rawJson: result.rawJson,
        error: null,
      };
    } catch (error) {
      forgeDebug('ltm', 'ltm recall graph search failed', {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        queryText: graphQueryText,
        dimension: graphDimension,
        includeSources: options.includeSources,
        hit: false,
        context: '',
        relevantContextRaw: null,
        sourcesCount: 0,
        sourcesJson: null,
        rawJson: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async getGraphDimension() {
    const indexState = await this.retrievalWorkspace.getStats();
    return indexState.activeIndexStats?.dimension ?? 0;
  }

  private async getWorkspaceIndexState() {
    return {
      workspaceCanBm25: true,
      workspaceCanVector: true,
      workspaceCanHybrid: true,
      ...(await this.retrievalWorkspace.getStats()),
    };
  }

  private async getIndexStats() {
    const [workspaceFileCount, memoryFileCount, checkpointFileCount] = await Promise.all([
      countFiles(this.agentMemoryPath, 'memory'),
      countFiles(this.agentMemoryPath, 'memory'),
      countFiles(this.agentMemoryPath, 'checkpoints'),
    ]);

    return {
      workspaceFileCount,
      memoryFileCount,
      checkpointFileCount,
    };
  }

  private async queryVectorIndex(queryVector: number[], topK: number): Promise<Array<{
    id: string;
    text: string;
    score: number;
    metadata?: Record<string, unknown>;
  }>> {
    return this.runTrackedRecallOperation<Array<{
      id: string;
      text: string;
      score: number;
      metadata?: Record<string, unknown>;
    }>>(
      'vector.query',
      this.retrievalWorkspace.queryVector(queryVector, topK),
      this.recallTimeoutMs,
      'ltm vector query timed out',
    );
  }

  private async runTrackedRecallOperation<T>(
    label: string,
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ) {
    this.pendingRecallOperationCount += 1;
    let settled = false;
    const trackedOperation = operation.finally(() => {
      settled = true;
      this.pendingRecallOperationCount = Math.max(0, this.pendingRecallOperationCount - 1);

      if (this.pendingRecallOperationCount === 0) {
        this.lingeringRecallOperationSince = null;
      }
    });

    try {
      return await withTimeout(trackedOperation, timeoutMs, timeoutMessage);
    } catch (error) {
      if (!settled && this.lingeringRecallOperationSince === null) {
        this.lingeringRecallOperationSince = Date.now();
      }

      forgeDebug('ltm', 'ltm recall operation failed or timed out', {
        agentId: this.agentId,
        label,
        timeoutMs,
        settled,
        pendingRecallOperationCount: this.pendingRecallOperationCount,
        lingeringRecallOperationSince: this.lingeringRecallOperationSince
          ? new Date(this.lingeringRecallOperationSince).toISOString()
          : null,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  private filterWorkspaceFallbackResults(
    results: SearchResult[],
    scoreThreshold: number,
    documentCount: number,
  ) {
    return results
      .filter((result) => (result.score ?? 0) >= scoreThreshold)
      .slice(0, documentCount);
  }

  private formatStructuredValue(value: unknown, indentLevel = 0): string {
    const indent = '  '.repeat(indentLevel);

    if (typeof value === 'string') {
      return value.trim();
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      if (value.length === 0) {
        return '';
      }

      return value
        .map((item) => this.formatStructuredValue(item, indentLevel + 1))
        .filter(Boolean)
        .map((item) => `${indent}- ${item.replace(/\n/g, `\n${indent}  `)}`)
        .join('\n');
    }

    if (!value || typeof value !== 'object') {
      return '';
    }

    return Object.entries(value)
      .map(([key, item]) => {
        const formatted = this.formatStructuredValue(item, indentLevel + 1);

        if (!formatted) {
          return '';
        }

        if (!formatted.includes('\n')) {
          return `${indent}${key}: ${formatted}`;
        }

        return `${indent}${key}:\n${formatted}`;
      })
      .filter(Boolean)
      .join('\n');
  }

  private readGraphRelevantContext(result: unknown) {
    if (!result || typeof result !== 'object') {
      return null;
    }

    const relevantContext = (result as Record<string, unknown>).relevantContext;

    if (typeof relevantContext === 'string') {
      return relevantContext;
    }

    if (Array.isArray(relevantContext)) {
      return relevantContext
        .map((value) => typeof value === 'string' ? value : '')
        .filter(Boolean)
        .join('\n\n');
    }

    return null;
  }

  private readGraphSources(result: unknown) {
    if (!result || typeof result !== 'object') {
      return [];
    }

    const sources = (result as Record<string, unknown>).sources;
    return Array.isArray(sources) ? sources : [];
  }

  private readGraphSourceDocument(source: unknown) {
    if (!source || typeof source !== 'object') {
      return '';
    }

    const document = (source as Record<string, unknown>).document;
    return typeof document === 'string' ? document.trim() : '';
  }

  private buildRecallQueryFromStep(step: unknown) {
    if (!step || typeof step !== 'object') {
      return '';
    }

    const record = step as Record<string, unknown>;
    const toolCalls = Array.isArray(record.toolCalls) ? record.toolCalls : [];
    const toolResults = Array.isArray(record.toolResults) ? record.toolResults : [];

    return [
      typeof record.text === 'string' ? record.text : '',
      typeof record.reasoningText === 'string' ? record.reasoningText : '',
      toolCalls
        .map((toolCall) => {
          if (!toolCall || typeof toolCall !== 'object') {
            return '';
          }

          const recordToolCall = toolCall as Record<string, unknown>;
          const toolName = typeof recordToolCall.toolName === 'string' ? recordToolCall.toolName : 'unknown';
          const formatted = this.formatStructuredValue(
            recordToolCall.args ?? recordToolCall.input ?? null,
          );

          if (!formatted) {
            return '';
          }

          return [`Tool call: ${toolName}`, formatted].join('\n');
        })
        .filter(Boolean)
        .join('\n\n'),
      toolResults
        .map((toolResult) => {
          if (!toolResult || typeof toolResult !== 'object') {
            return '';
          }

          const recordToolResult = toolResult as Record<string, unknown>;
          const toolName = typeof recordToolResult.toolName === 'string' ? recordToolResult.toolName : 'unknown';
          const formatted = this.formatStructuredValue(
            recordToolResult.result ?? recordToolResult.output ?? null,
          );

          if (!formatted) {
            return '';
          }

          return [`Tool result: ${toolName}`, formatted].join('\n');
        })
        .filter(Boolean)
        .join('\n\n'),
    ]
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private async persistRecallSnapshot(
    threadContext: { threadId: string | null; resourceId?: string },
    snapshot: LongTermMemoryRecallSnapshot,
    history?: LongTermMemoryRecallHistory,
  ) {
    await this.persistenceStore.writeRecallState({
      threadId: threadContext.threadId,
      resourceId: threadContext.resourceId,
      snapshot,
      history,
    });
  }

  private async clearPersistedRecallState() {
    await this.persistenceStore.clearRecallState();
  }

  private dedupeRecallResults(input: {
    graph: {
      hit: boolean;
      context: string;
      queryText: string;
      dimension: number;
      includeSources: boolean;
      relevantContextRaw: string | null;
      sourcesCount: number;
      sourcesJson: string | null;
      rawJson: string | null;
      error: string | null;
    };
    results: SearchResult[];
    recentFingerprints: string[];
  }) {
    const seenFingerprints = new Set(input.recentFingerprints);
    const workspaceResults = input.results.filter(
      (result) => !seenFingerprints.has(this.buildWorkspaceFingerprint(result)),
    );
    const graphFingerprint = input.graph.hit && input.graph.context.trim()
      ? this.buildGraphFingerprint(input.graph.context)
      : null;
    const graphAllowed = graphFingerprint !== null && !seenFingerprints.has(graphFingerprint);
    const candidateFingerprints = graphFingerprint
      ? [graphFingerprint]
      : input.results.map((result) => this.buildWorkspaceFingerprint(result));

    return {
      graph: graphAllowed
        ? input.graph
        : {
          ...input.graph,
          hit: false,
          context: '',
        },
      results: graphAllowed ? input.results : workspaceResults,
      candidateFingerprints,
      usedFingerprints: graphAllowed
        ? (graphFingerprint ? [graphFingerprint] : [])
        : workspaceResults.map((result) => this.buildWorkspaceFingerprint(result)),
    };
  }

  private buildWorkspaceFingerprint(result: SearchResult) {
    return `workspace:${result.id}`;
  }

  private buildGraphFingerprint(context: string) {
    return `graph:${createHash('sha1').update(context).digest('hex')}`;
  }

  private buildNextRecallHistory(input: {
    recentFingerprints: string[];
    candidateFingerprints: string[];
    windowSize: number;
  }) {
    const merged = [...input.candidateFingerprints, ...input.recentFingerprints];
    const deduped = Array.from(new Set(merged));

    return {
      recentFingerprints: deduped.slice(0, Math.max(input.windowSize, 1)),
      updatedAt: new Date().toISOString(),
    } satisfies LongTermMemoryRecallHistory;
  }

  private async readRecallThreadState(threadId: string | null) {
    const persistedState = await this.persistenceStore.readRecallState();
    const recentFingerprints = Array.isArray(persistedState.history?.recentFingerprints)
      ? persistedState.history.recentFingerprints.filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )
      : [];
    const checkpointedOmState = await this.checkpointedOmStateStore.readState();
    const recentRawMessageCount = checkpointedOmState.latestMetrics?.recentRawMessageCount;

    return {
      recentFingerprints,
      windowSize:
        typeof recentRawMessageCount === 'number' && recentRawMessageCount > 0
          ? Math.max(1, Math.floor(recentRawMessageCount * 0.25))
          : 20,
    };
  }
}

function safeSerializeRecallSteps(steps: unknown[]) {
  try {
    return JSON.stringify(steps, null, 2);
  } catch {
    return '[unserializable steps payload]';
  }
}

function safeSerializeGraphResult(result: unknown) {
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return '[unserializable graph result]';
  }
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;');
}

function buildRecallSystemMessage(input: {
  query: string;
  graphHit: boolean;
  graphContext: string;
  results: SearchResult[];
}) {
  const items = input.graphHit
    ? (
        input.graphContext.trim()
          ? [
              `  <item source="graph" query="${escapeXml(input.query)}">${escapeXml(input.graphContext.trim())}</item>`,
            ]
          : []
      )
    : input.results.map((result) => (
      `  <item source="workspace" id="${escapeXml(result.id)}" score="${typeof result.score === 'number' ? result.score.toFixed(4) : '0.0000'}">${escapeXml(result.content)}</item>`
    ));

  if (items.length === 0) {
    return null;
  }

  return [
    `<memory-recall on-datetime="${new Date().toISOString()}">`,
    `  <instructions>${escapeXml('Now is the datetime in the on-datetime attribute. These recalled items are past information that is no longer in your active context or that your long-term memory consolidated. You may already have seen or resolved them. Use them only as additional relevant context when useful, and prefer more recent context if there is any conflict. If you mention or use this information, do not talk about memory, long-term memory, or recalled context. Use active language such as "I remember that...", "we already saw that...", or "on day X in the morning I did X" when that is appropriate.')}</instructions>`,
    ...items,
    '</memory-recall>',
  ].join('\n');
}

export function createAgentLongTermMemoryRecall(input: {
  agentId: string;
  agentWorkspacePath: string;
  agentMemoryPath: string;
  mastraId: string;
  workspaceEmbedder?: WorkspaceEmbedderId;
  scoreThreshold?: number;
  documentCount?: number;
  readRuntimeMemorySettings?: () => Promise<{
    ltmRecallSearchMode: 'hybrid' | 'vector' | 'bm25';
    ltmRecallGraphTopK: number;
    ltmRecallGraphThreshold: number;
    ltmRecallGraphRandomWalkSteps: number;
    ltmRecallGraphIncludeSources: boolean;
    ltmRecallScoreThreshold: number;
    ltmRecallDocumentCount: number;
  }>;
  checkpointedOmStateStore: CheckpointedOmStateStore & {
    readState(): Promise<{
      latestMetrics?: {
        recentRawMessageCount?: number;
      } | null;
    }>;
  };
  persistenceStore: ReturnType<typeof createAgentLongTermMemoryStore>;
  model?: unknown;
}) {
  return new AgentLongTermMemoryRecall(input);
}
