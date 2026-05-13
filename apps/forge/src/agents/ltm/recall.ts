import { createHash } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs/promises';

import {
  type ConversationStore,
  embedTextWithWorkspaceEmbedder,
  FilesystemDocumentSource,
  forgeDebug,
  readOperationalMemoryState,
  SqliteWorkspaceRetrieval,
  type WorkspaceEmbedderId,
} from '@forge-runtime/core';

import type {
  LongTermMemoryRecallHistory,
  LongTermMemoryRecallSnapshot,
  createAgentLongTermMemoryStore,
} from './store';
import { withTimeout } from '../../utils/async';


import { safeSerializeRecallSteps, safeSerializeGraphResult, escapeXml, buildRecallSystemMessage, type LtmSearchResult } from '../agent-ltm-helpers';
import { buildLtmRecallSnapshot, partitionRecallResults, buildNextRecallHistory } from '../agent-ltm-snapshot';

export type AgentLongTermMemoryRecallDebugSearchInput = {
  query: string;
};

export type AgentLongTermMemoryRecallDebugSearchResult = {
  query: string;
  topK: number;
  searchMode: 'hybrid' | 'vector' | 'bm25';
  graphTopK: number;
  graphThreshold: number;
  graphScore: number | null;
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
  '.',
] as const;
const RECALL_INJECTION_RAW_WINDOW_RATIO = 0.25;

type RecallConfig = {
  searchMode: 'hybrid' | 'vector' | 'bm25';
  scoreThreshold: number;
  documentCount: number;
  graphRandomWalkSteps: number;
  graphIncludeSources: boolean;
};

async function countFiles(rootPath: string, relativePath: string): Promise<number> {
  const absolutePath = path.resolve(rootPath, relativePath.replace(/^\//, ''));
  const entries = await fs.readdir(absolutePath, { withFileTypes: true }).catch((err) => { forgeDebug({ scope: 'agent-long-term-memory-recall', level: 'error', message: '[safe-catch] readdir', context: { error: err instanceof Error ? { message: err.message, name: err.name, stack: err.stack } : err } }); return null; });

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

export class AgentLongTermMemoryRecall {
  private readonly initTimeoutMs = 5 * 60_000;
  private readonly recallTimeoutMs = 60_000;
  private readonly agentId: string;
  private readonly retrievalWorkspace: SqliteWorkspaceRetrieval;
  private readonly agentMemoryPath: string;
  private readonly agentWorkspacePath: string;
  private readonly workspaceEmbedder: WorkspaceEmbedderId;
  private readonly readRuntimeMemorySettings?: () => Promise<{
    ltmRecallSearchMode: 'hybrid' | 'vector' | 'bm25';
    ltmRecallWorkspaceTopK: number;
    ltmRecallGraphTopK: number;
    ltmRecallGraphThreshold: number;
    ltmRecallGraphRandomWalkSteps: number;
    ltmRecallGraphIncludeSources: boolean;
    ltmRecallScoreThreshold: number;
    ltmRecallDocumentCount: number;
  }>;
  private readonly conversationStore: ConversationStore;
  private readonly recentRawTokens: number;
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
      ltmRecallWorkspaceTopK: number;
      ltmRecallGraphTopK: number;
      ltmRecallGraphThreshold: number;
      ltmRecallGraphRandomWalkSteps: number;
      ltmRecallGraphIncludeSources: boolean;
      ltmRecallScoreThreshold: number;
      ltmRecallDocumentCount: number;
    }>;
    conversationStore: ConversationStore;
    recentRawTokens?: number;
    persistenceStore: ReturnType<typeof createAgentLongTermMemoryStore>;
  }) {
    this.agentId = input.agentId;
    this.agentMemoryPath = input.agentMemoryPath;
    this.agentWorkspacePath = input.agentWorkspacePath;
    this.workspaceEmbedder = input.workspaceEmbedder ?? 'fastembed';
    this.readRuntimeMemorySettings = input.readRuntimeMemorySettings;
    this.conversationStore = input.conversationStore;
    this.recentRawTokens = input.recentRawTokens ?? 0;
    this.persistenceStore = input.persistenceStore;
    if (input.retrievalWorkspace) {
      this.retrievalWorkspace = input.retrievalWorkspace;
    } else {
      this.retrievalWorkspace = new SqliteWorkspaceRetrieval({
        databasePath: path.resolve(input.agentWorkspacePath, `${input.agentId}-memory-recall.db`),
        source: new FilesystemDocumentSource({
          roots: [
            input.agentMemoryPath,
          ],
          includeExtensions: ['.txt', '.md'],
        }),
        embedder: {
          embed: async ({ texts }: { texts: string[] }) => ({
            vectors: await Promise.all(texts.map((text: string) =>
              embedTextWithWorkspaceEmbedder(this.workspaceEmbedder, text))),
          }),
        },
      });
    }
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
        forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall skipped because a prior recall operation is still in flight', context: {
          agentId: this.agentId,
          threadId: input.threadId,
          pendingRecallOperationCount: this.pendingRecallOperationCount,
          lingeringRecallOperationSince: this.lingeringRecallOperationSince
            ? new Date(this.lingeringRecallOperationSince).toISOString()
            : null,
        } });
        return null;
      }

      forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall step start', context: {
        agentId: this.agentId,
        threadId: input.threadId,
        resourceId: input.resourceId ?? null,
      } });
      const queryText = this.buildRecallQueryFromStep(input.step);
      const recallThreadState = await this.readRecallThreadState(input.threadId);

      if (!queryText) {
        await this.persistRecallSnapshot({
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, buildLtmRecallSnapshot({
          lastInitAt: this.lastInitAt,
          steps: input.steps,
        }, {
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, {
          status: 'miss',
        }), {
          recentFingerprints: recallThreadState.recentFingerprints,
          updatedAt: Date.now(),
        });
        return null;
      }

      const recallConfig = await this.resolveRecallConfig();
      const recallSearch = await this.runRecallSearch(queryText, recallConfig);
      const { results, graph, historyFingerprints } = partitionRecallResults({
        graph: recallSearch.graph,
        results: recallSearch.results,
        recentFingerprints: recallThreadState.recentFingerprints,
      });
      const nextHistory = buildNextRecallHistory({
        recentFingerprints: recallThreadState.recentFingerprints,
        candidateFingerprints: historyFingerprints,
        windowSize: recallThreadState.windowSize,
      });
      const indexStats = await this.getIndexStats();
      if (this.shouldSkipRecallInjection({
        graph,
        results,
        rawWindowMessageCount: recallThreadState.rawWindowMessageCount,
      })) {
        await this.persistRecallSnapshot({
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, buildLtmRecallSnapshot({
          lastInitAt: this.lastInitAt,
          steps: input.steps,
          queryText,
          recallConfig,
          indexStats,
          dedupedGraph: graph,
          filteredResults: results,
        }, {
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, {
          status: 'hit',
        }), nextHistory);
        return null;
      }

      const recallText = buildRecallSystemMessage({
        graphHit: graph.hit,
        graphScore: graph.score,
        graphContext: graph.context,
        query: queryText,
        results,
      });

      if (!recallText) {
        await this.persistRecallSnapshot({
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, buildLtmRecallSnapshot({
          lastInitAt: this.lastInitAt,
          steps: input.steps,
          queryText,
          recallConfig,
          indexStats,
          dedupedGraph: graph,
          filteredResults: results,
        }, {
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, {
          status: 'hit',
        }), nextHistory);
        return null;
      }

      await this.persistRecallSnapshot({
        threadId: input.threadId,
        resourceId: input.resourceId,
      }, buildLtmRecallSnapshot({
        lastInitAt: this.lastInitAt,
        steps: input.steps,
        queryText,
        recallConfig,
        indexStats,
        dedupedGraph: graph,
        filteredResults: results,
      }, {
        threadId: input.threadId,
        resourceId: input.resourceId,
      }, {
        status: 'hit',
      }), nextHistory);

      forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall step complete', context: {
        agentId: this.agentId,
        threadId: input.threadId,
        durationMs: Date.now() - recallStartedAt,
        graphHit: graph.hit,
        resultCount: graph.hit ? 0 : results.length,
      } });

      return recallText;
    } catch (error) {
      forgeDebug({ scope: 'agent-long-term-memory-recall', level: 'error', message: 'recall failed', context: { error: error instanceof Error ? { message: error.message, name: error.name, stack: error.stack } : error } });
      forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall step failed', context: {
        agentId: this.agentId,
        threadId: input.threadId,
        durationMs: Date.now() - recallStartedAt,
        error: error instanceof Error ? error.message : String(error),
      } });
      const persistedState = await this.persistenceStore.readRecallState();
      let snapshotError: string | null = null;
      try {
        snapshotError = error instanceof Error ? error.message : String(error);
      } catch (e) {
        forgeDebug({ scope: 'agent-long-term-memory-recall', level: 'warn', message: 'snapshotError from error failed', context: { error: e instanceof Error ? { message: e.message, name: e.name, stack: e.stack } : e } });
        snapshotError = String(error);
      }
      try {
        await this.persistRecallSnapshot({
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, buildLtmRecallSnapshot({
          lastInitAt: this.lastInitAt,
          steps: input.steps,
        }, {
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, {
          status: 'error',
          error: snapshotError,
        }), persistedState?.history ?? undefined);
      } catch (e) {
        forgeDebug({ scope: 'agent-long-term-memory-recall', level: 'warn', message: 'persistRecallSnapshot failed', context: { threadId: input.threadId, resourceId: input.resourceId, error: e instanceof Error ? { message: e.message, name: e.name, stack: e.stack } : e } });
      }
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

    forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall workspace init start', context: {
      agentId: this.agentId,
      stamp: currentStamp,
    } });
    await this.runTrackedRecallOperation(
      'retrieval.refresh',
      this.retrievalWorkspace.refresh(),
      this.initTimeoutMs,
      'ltm recall retrieval init timed out',
    );
    this.workspaceInitialized = true;
    this.lastIndexedStamp = currentStamp;
    this.lastInitAt = new Date().toISOString();
    forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall workspace init complete', context: {
      agentId: this.agentId,
      durationMs: Date.now() - stageStartedAt,
      stamp: currentStamp,
    } });
  }

  async refreshIndex() {
    await this.initialize();
    const stageStartedAt = Date.now();
    const currentStamp = await this.readCurrentIndexStamp();

    if (currentStamp === this.lastIndexedStamp) {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall workspace index unchanged', context: {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        stamp: currentStamp,
      } });
      return;
    }

    forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall workspace reindex start', context: {
      agentId: this.agentId,
      previousStamp: this.lastIndexedStamp,
      nextStamp: currentStamp,
    } });
    await this.runTrackedRecallOperation(
      'retrieval.refresh',
      this.retrievalWorkspace.refresh(),
      this.initTimeoutMs,
      'ltm recall retrieval refresh timed out',
    );
    this.lastIndexedStamp = currentStamp;
    this.lastInitAt = new Date().toISOString();
    forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall workspace reindex complete', context: {
      agentId: this.agentId,
      durationMs: Date.now() - stageStartedAt,
      stamp: currentStamp,
    } });
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
        graphTopK: recallConfig.documentCount,
        graphThreshold: recallConfig.scoreThreshold,
        graphScore: null,
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
      effectiveGraphTopK,
      effectiveGraphThreshold,
    } = recallSearch;
    const vectorResults = await this.queryVectorIndex(
      queryEmbedding,
      recallConfig.documentCount,
    );
    const highestScore = rawWorkspaceResults.reduce((currentMax, result) => {
      const score = typeof result.score === 'number' ? result.score : 0;
      return Math.max(currentMax, score);
    }, 0);

    return {
      query,
      topK: recallConfig.documentCount,
      searchMode: recallConfig.searchMode,
      graphTopK: recallConfig.documentCount,
      graphThreshold: recallConfig.scoreThreshold,
      graphScore: graphSearch.score,
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
        graphScore: graphSearch.score,
        graphContext: graphSearch.context,
        query,
        results,
      }),
    } satisfies AgentLongTermMemoryRecallDebugSearchResult;
  }

  private async runRecallSearch(queryText: string, config: RecallConfig) {
    const workspaceSearch = await this.searchWorkspace(queryText, {
      topK: config.documentCount,
      scoreThreshold: config.scoreThreshold,
      resultCount: config.documentCount,
      mode: config.searchMode,
    });
    const graphSearch = await this.searchGraph(queryText, workspaceSearch.results, {
      topK: config.documentCount,
      threshold: config.scoreThreshold,
      randomWalkSteps: config.graphRandomWalkSteps,
      includeSources: config.graphIncludeSources,
      contextResults: workspaceSearch.results,
    });
    const workspaceFormattedContext = workspaceSearch.results
      .map((result) => `${result.id}\n${result.content}`)
      .join('\n\n');

    return {
      formatted: graphSearch.hit ? '' : workspaceFormattedContext,
      results: workspaceSearch.results,
      rawWorkspaceResults: workspaceSearch.results,
      graph: graphSearch,
      effectiveGraphTopK: config.documentCount,
      effectiveGraphThreshold: config.scoreThreshold,
    };
  }

  private async resolveRecallConfig() {
    const runtimeSettings = await this.readRuntimeMemorySettings?.();

    if (!runtimeSettings) {
      forgeDebug({ scope: 'ltm-recall', level: 'warn', message: 'recallFromLongTermMemory: runtime memory settings required' });
      throw new Error('LTM recall requires runtime memory settings');
    }

    return {
      searchMode: runtimeSettings.ltmRecallSearchMode,
      scoreThreshold: runtimeSettings.ltmRecallScoreThreshold,
      documentCount: runtimeSettings.ltmRecallDocumentCount,
      graphRandomWalkSteps: runtimeSettings.ltmRecallGraphRandomWalkSteps,
      graphIncludeSources: runtimeSettings.ltmRecallGraphIncludeSources,
    } satisfies RecallConfig;
  }

  private async readCurrentIndexStamp() {
    return await this.persistenceStore.readRecallIndexStamp();
  }

  private async searchWorkspace(
    queryText: string,
    options: {
      topK: number;
      resultCount: number;
      scoreThreshold: number;
      mode: 'hybrid' | 'vector' | 'bm25';
    } = {
      topK: 1,
      resultCount: 1,
      scoreThreshold: 0,
      mode: 'hybrid',
    },
  ): Promise<{ formatted: string; results: LtmSearchResult[] }> {
    const stageStartedAt = Date.now();

    try {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall workspace search start', context: {
        agentId: this.agentId,
        queryLength: queryText.length,
        topK: options.topK,
        mode: options.mode,
      } });
      const results = await this.runTrackedRecallOperation<Array<{
        id: string;
        text: string;
        score: number;
        metadata?: Record<string, unknown>;
      }>>(
        'retrieval.search',
        this.retrievalWorkspace.search(queryText, {
          topK: options.topK,
          resultLimit: options.resultCount,
          scoreThreshold: options.scoreThreshold,
          mode: options.mode,
        }),
        this.recallTimeoutMs,
        'ltm recall retrieval search timed out',
      );

      if (results.length === 0) {
        return { formatted: '', results: [] };
      }

      const searchResults: LtmSearchResult[] = results.map((result) => ({
        id: result.id,
        content: result.text.trim(),
        score: result.score,
      }));
      forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall workspace search complete', context: {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        resultCount: searchResults.length,
      } });
      return { formatted: '', results: searchResults };
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      if (err.includes('SQLITE_ERROR: no such table') || err.includes('no such table:')) {
        return { formatted: '', results: [] };
      }

      forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall workspace search failed', context: {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        error: error instanceof Error ? error.message : String(error),
      } });
      throw error;
    }
  }

  private async searchGraph(
    queryText: string,
    workspaceResults: LtmSearchResult[],
    options: {
      topK: number;
      threshold: number;
      randomWalkSteps: number;
      includeSources: boolean;
      contextResults: LtmSearchResult[];
    } = {
      topK: 1,
      threshold: 0,
      randomWalkSteps: 0,
      includeSources: false,
      contextResults: [],
    },
  ): Promise<{
    queryText: string;
    dimension: number;
    includeSources: boolean;
    hit: boolean;
    score: number | null;
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

      forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall graph search complete', context: {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        hit: result.hit,
        sourcesCount: result.sourcesCount,
      } });

      return {
        queryText: graphQueryText,
        dimension: graphDimension,
        includeSources: options.includeSources,
        hit: result.hit,
        score: result.score,
        context: result.context,
        relevantContextRaw: result.relevantContextRaw,
        sourcesCount: result.sourcesCount,
        sourcesJson: result.sourcesJson,
        rawJson: result.rawJson,
        error: null,
      };
    } catch (error) {
      forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall graph search failed', context: {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        error: error instanceof Error ? error.message : String(error),
      } });

      return {
        queryText: graphQueryText,
        dimension: graphDimension,
        includeSources: options.includeSources,
        hit: false,
        score: null,
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
    return await this.runTrackedRecallOperation<Array<{
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

      forgeDebug({ scope: 'ltm', level: 'info', message: 'ltm recall operation failed or timed out', context: {
        agentId: this.agentId,
        label,
        timeoutMs,
        settled,
        pendingRecallOperationCount: this.pendingRecallOperationCount,
        lingeringRecallOperationSince: this.lingeringRecallOperationSince
          ? new Date(this.lingeringRecallOperationSince).toISOString()
          : null,
        error: error instanceof Error ? error.message : String(error),
      } });
      forgeDebug({ scope: 'ltm-recall', level: 'error', message: 'ltm-recall operation failed', error: error instanceof Error ? error.message : String(error) });
      throw error;
    }
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

  private partitionRecallResults(input: {
    graph: {
      hit: boolean;
      score: number | null;
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
    results: LtmSearchResult[];
    recentFingerprints: string[];
  }) {
    const seenFingerprints = new Set(input.recentFingerprints);
    const workspaceFingerprints = input.results.map((result) => ({
      result,
      fingerprint: this.buildWorkspaceFingerprint(result),
    }));
    const workspaceResults = workspaceFingerprints
      .filter((entry) => !seenFingerprints.has(entry.fingerprint))
      .map((entry) => entry.result);
    const graphFingerprint = input.graph.hit && input.graph.context.trim()
      ? this.buildGraphFingerprint(input.graph.context)
      : null;
    const graphAllowed = graphFingerprint !== null && !seenFingerprints.has(graphFingerprint);
    const historyFingerprints = [
      ...(graphFingerprint ? [graphFingerprint] : []),
      ...workspaceFingerprints.map((entry) => entry.fingerprint),
    ];

    return {
      graph: graphAllowed
        ? input.graph
        : {
          ...input.graph,
          hit: false,
          context: '',
        },
      results: graphAllowed ? input.results : workspaceResults,
      historyFingerprints,
    };
  }

  private buildWorkspaceFingerprint(result: LtmSearchResult) {
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
      updatedAt: Date.now(),
    } satisfies LongTermMemoryRecallHistory;
  }

  private async readRecallThreadState(threadId: string | null) {
    const persistedState = await this.persistenceStore.readRecallState();
    const recentFingerprints = Array.isArray(persistedState.history?.recentFingerprints)
      ? persistedState.history.recentFingerprints.filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      )
      : [];
    const operationalMemoryState = threadId
      ? await readOperationalMemoryState({
          threadId,
          store: this.conversationStore,
          recentTokenLimit: this.recentRawTokens,
        })
      : null;
    const rawWindowMessageCount = operationalMemoryState
      ? operationalMemoryState.metrics.rawMessageCount
      : 0;

    return {
      recentFingerprints,
      windowSize:
        rawWindowMessageCount > 0
          ? Math.max(1, Math.floor(rawWindowMessageCount * 0.25))
          : 20,
      rawWindowMessageCount,
    };
  }

  private shouldSkipRecallInjection(input: {
    graph: {
      hit: boolean;
      sourcesCount: number;
    };
    results: LtmSearchResult[];
    rawWindowMessageCount: number;
  }) {
    if (input.rawWindowMessageCount <= 0) {
      return false;
    }

    const recallItemCount = input.graph.hit
      ? input.graph.sourcesCount
      : input.results.length;

    if (recallItemCount <= 0) {
      return false;
    }

    const limit = Math.max(1, Math.floor(input.rawWindowMessageCount * RECALL_INJECTION_RAW_WINDOW_RATIO));
    return recallItemCount >= limit;
  }
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
    ltmRecallWorkspaceTopK: number;
    ltmRecallGraphTopK: number;
    ltmRecallGraphThreshold: number;
    ltmRecallGraphRandomWalkSteps: number;
    ltmRecallGraphIncludeSources: boolean;
    ltmRecallScoreThreshold: number;
    ltmRecallDocumentCount: number;
  }>;
  conversationStore: ConversationStore;
  recentRawTokens?: number;
  persistenceStore: ReturnType<typeof createAgentLongTermMemoryStore>;
}) {
  return new AgentLongTermMemoryRecall(input);
}
