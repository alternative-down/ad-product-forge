import path from 'node:path';

import {
  type ConversationStore,
  embedTextWithWorkspaceEmbedder,
  FilesystemDocumentSource,
  forgeDebug,
  readOperationalMemoryState,
  SqliteWorkspaceRetrieval,
  type WorkspaceEmbedderId,
} from '@forge-runtime/core';
import { serializeError, errorMsg } from '../agent-runner-error-formatting';
import { RecallPersistence, createRecallPersistence } from './recall/persistence';

const RECALL_INJECTION_RAW_WINDOW_RATIO = 0.25;

import type {
  LongTermMemoryRecallHistory,
  LongTermMemoryRecallSnapshot,
  createAgentLongTermMemoryStore,
} from './store';
import type { LtmSnapshotDeps } from '../agent-ltm-snapshot';
import { withTimeout } from '../../utils/async';

import { buildRecallSystemMessage, type LtmSearchResult } from '../agent-ltm-helpers';
import {
  buildLtmRecallSnapshot,
  partitionRecallResults,
  buildNextRecallHistory,
} from '../agent-ltm-snapshot';
import type { RecallConfig } from './recall/types';
import {
  RecallOrchestrator,
  createRecallOrchestrator,
  type RecallOrchestratorDeps,
} from './recall/orchestrator';
import { runVectorQuery} from './recall/vector-search';


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
  private readonly orchestrator: RecallOrchestrator;
  private readonly persistence: RecallPersistence;

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
    if ('retrievalWorkspace' in input && input.retrievalWorkspace !== undefined) {
      this.retrievalWorkspace =
        input.retrievalWorkspace as import('@forge-runtime/core').SqliteWorkspaceRetrieval;
    } else {
      this.retrievalWorkspace = new SqliteWorkspaceRetrieval({
        databasePath: path.resolve(input.agentWorkspacePath, `${input.agentId}-memory-recall.db`),
        source: new FilesystemDocumentSource({
          roots: [input.agentMemoryPath],
          includeExtensions: ['.txt', '.md'],
        }),
        embedder: {
          embed: async ({ texts }: { texts: string[] }): Promise<unknown> => ({
            vectors: await Promise.all(
              texts.map((text: string) =>
                embedTextWithWorkspaceEmbedder(this.workspaceEmbedder, text),
              ),
            ),
          }),
        } as unknown as import('@forge-runtime/core').SqliteWorkspaceRetrieval['embedder'],
      });
    }

    const orchestratorDeps: RecallOrchestratorDeps = {
      retrievalWorkspace: this.retrievalWorkspace,
      agentId: this.agentId,
      agentWorkspacePath: this.agentWorkspacePath,
      agentMemoryPath: this.agentMemoryPath,
      workspaceEmbedder: this.workspaceEmbedder,
      readRuntimeMemorySettings: this.readRuntimeMemorySettings,
      recallTimeoutMs: this.recallTimeoutMs,
      runTrackedRecallOperation: this.runTrackedRecallOperation.bind(this),
    };
    this.orchestrator = createRecallOrchestrator(orchestratorDeps);
    this.persistence = createRecallPersistence({
      persistenceStore: this.persistenceStore,
      conversationStore: this.conversationStore,
      agentMemoryPath: this.agentMemoryPath,
      lastInitAt: this.lastInitAt,
    });
  }
  // ─── recallFromStep sub-methods ─────────────────────────────────────────

  private isRecallInFlight(): boolean {
    return this.pendingRecallOperationCount > 0;
  }

  private logInFlightSkip(threadId: string | null): void {
    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall skipped because a prior recall operation is still in flight',
      context: {
        agentId: this.agentId,
        threadId,
        pendingRecallOperationCount: this.pendingRecallOperationCount,
        lingeringRecallOperationSince:
          this.lingeringRecallOperationSince !== undefined
            ? new Date(this.lingeringRecallOperationSince!).toISOString()
            : null,
      },
    });
  }

  private async persistMissRecall(
    input: { step: unknown; steps: unknown[]; threadId: string | null; resourceId?: string },
    recentFingerprints: string[],
  ): Promise<void> {
    await this.persistRecallSnapshotWithInput(input, {
      status: 'miss',
      history: {
        recentFingerprints,
        updatedAt: String(Date.now()),
      },
    });
  }

  private async persistHitRecall(
    input: { step: unknown; steps: unknown[]; threadId: string | null; resourceId?: string },
    queryText: string,
    recallConfig: RecallConfig,
    indexStats: { workspaceFileCount: number; memoryFileCount: number; checkpointFileCount: number },
    dedupedGraph: { hit: boolean; score?: number; context: string },
    filteredResults: LtmSearchResult[],
    history: LongTermMemoryRecallHistory,
  ): Promise<void> {
    await this.persistRecallSnapshotWithInput(input, {
      queryText,
      recallConfig,
      indexStats,
      dedupedGraph,
      filteredResults,
      history,
      status: 'hit',
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
      if (this.isRecallInFlight()) {
        this.logInFlightSkip(input.threadId);
        return null;
      }

      forgeDebug({
        scope: 'ltm',
        level: 'info',
        message: 'ltm recall step start',
        context: {
          agentId: this.agentId,
          threadId: input.threadId,
          resourceId: input.resourceId ?? null,
        },
      });
      const queryText = this.buildRecallQueryFromStep(input.step);
      const recallThreadState = await this.readRecallThreadState(input.threadId);

      if (!queryText) {
        await this.persistMissRecall(input, recallThreadState.recentFingerprints);
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
        graph: { ...graph, sourcesCount: 0 },
        results,
        rawWindowMessageCount: recallThreadState.rawWindowMessageCount ?? 0,
      })) {
        await this.persistHitRecall(input, queryText, recallConfig, indexStats, graph, results, nextHistory);
        return null;
      }

      const recallText = buildRecallSystemMessage({
        graphHit: graph.hit,
        graphScore: graph.score ?? 0,
        graphContext: graph.context,
        query: queryText,
        results,
      });

      if (!recallText) {
        await this.persistHitRecall(input, queryText, recallConfig, indexStats, graph, results, nextHistory);
        return null;
      }

      await this.persistHitRecall(input, queryText, recallConfig, indexStats, graph, results, nextHistory);

      forgeDebug({
        scope: 'ltm',
        level: 'info',
        message: 'ltm recall step complete',
        context: {
          agentId: this.agentId,
          threadId: input.threadId,
          durationMs: Date.now() - recallStartedAt,
          graphHit: graph.hit,
          resultCount: graph.hit ? 0 : results.length,
        },
      });

      return recallText;
    } catch (error) {
      forgeDebug({
        scope: 'ltm-recall',
        level: 'error',
        message: 'recall failed',
        context: {
          error: serializeError(error),
        },
      });
      forgeDebug({
        scope: 'ltm',
        level: 'info',
        message: 'ltm recall step failed',
        context: {
          agentId: this.agentId,
          threadId: input.threadId,
          durationMs: Date.now() - recallStartedAt,
          error: errorMsg(error),
        },
      });
      const persistedState = await this.persistenceStore.readRecallState();
      let snapshotError: string | null = null;
      try {
        snapshotError = errorMsg(error);
      } catch (e) {
        forgeDebug({
          scope: 'ltm-recall',
          level: 'warn',
          message: 'snapshotError from error failed',
          context: {
            error: serializeError(e),
          },
        });
        snapshotError = String(error);
      }
      try {
        await this.persistRecallSnapshotWithInput(input, {
          status: 'error',
          error: snapshotError,
          history: persistedState?.history ?? undefined,
        });
      } catch (e) {
        forgeDebug({
          scope: 'ltm-recall',
          level: 'warn',
          message: 'persistRecallSnapshot failed',
          context: {
            threadId: input.threadId,
            resourceId: input.resourceId,
            error: serializeError(e),
          },
        });
      }
      return null;
    }
  }

  dispose() {
    this.retrievalWorkspace.dispose();
  }

  async initialize() {
    if (this.workspaceInitialized) {
      return;
    }

    const stageStartedAt = Date.now();
    const currentStamp = await this.readCurrentIndexStamp();

    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall workspace init start',
      context: {
        agentId: this.agentId,
        stamp: currentStamp,
      },
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
    this.persistence.setLastInitAt(this.lastInitAt);
    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall workspace init complete',
      context: {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        stamp: currentStamp,
      },
    });
  }

  async refreshIndex() {
    await this.initialize();
    const stageStartedAt = Date.now();
    const currentStamp = await this.readCurrentIndexStamp();

    if (currentStamp === this.lastIndexedStamp) {
      forgeDebug({
        scope: 'ltm',
        level: 'info',
        message: 'ltm recall workspace index unchanged',
        context: {
          agentId: this.agentId,
          durationMs: Date.now() - stageStartedAt,
          stamp: currentStamp,
        },
      });
      return;
    }

    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall workspace reindex start',
      context: {
        agentId: this.agentId,
        previousStamp: this.lastIndexedStamp,
        nextStamp: currentStamp,
      },
    });
    await this.runTrackedRecallOperation(
      'retrieval.refresh',
      this.retrievalWorkspace.refresh(),
      this.initTimeoutMs,
      'ltm recall retrieval refresh timed out',
    );
    this.lastIndexedStamp = currentStamp;
    this.lastInitAt = new Date().toISOString();
    this.persistence.setLastInitAt(this.lastInitAt);
    forgeDebug({
      scope: 'ltm',
      level: 'info',
      message: 'ltm recall workspace reindex complete',
      context: {
        agentId: this.agentId,
        durationMs: Date.now() - stageStartedAt,
        stamp: currentStamp,
      },
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
      effectiveGraphTopK: _effectiveGraphTopK,
      effectiveGraphThreshold: _effectiveGraphThreshold,
    } = recallSearch;
    const vectorResults = await this.queryVectorIndex(queryEmbedding, recallConfig.documentCount);
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
        relativePercent:
          typeof result.score === 'number' && highestScore > 0
            ? (result.score / highestScore) * 100
            : null,
      })),
      vectorResults: vectorResults.map(
        (result: {
          id: string;
          score: number;
          metadata?: Record<string, unknown>;
          text: string;
        }) => ({
          id: result.id,
          score: result.score,
          metadataJson: result.metadata ? JSON.stringify(result.metadata, null, 2) : null,
          document: result.text,
        }),
      ),
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

  private async readCurrentIndexStamp() {
    return await this.persistenceStore.readRecallIndexStamp();
  }

  async resolveRecallConfig() {
    return await this.orchestrator.resolveRecallConfig();
  }

  async runRecallSearch(queryText: string, config: RecallConfig) {
    return await this.orchestrator.runRecallSearch(queryText, config);
  }

  async searchWorkspace(
    queryText: string,
    options: {
      topK: number;
      resultCount: number;
      scoreThreshold: number;
      mode: 'hybrid' | 'vector' | 'bm25';
    },
  ) {
    return await this.orchestrator.searchWorkspace(queryText, options);
  }

  async searchGraph(
    queryText: string,
    workspaceResults: LtmSearchResult[],
    options: {
      topK: number;
      threshold: number;
      randomWalkSteps: number;
      includeSources: boolean;
      contextResults: LtmSearchResult[];
    },
  ) {
    return await this.orchestrator.searchGraph(queryText, workspaceResults, options);
  }

  async runTrackedRecallOperation<T>(
    label: string,
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ) {
    return await this._runTrackedRecallOperation(label, operation, timeoutMs, timeoutMessage);
  }

  private async _runTrackedRecallOperation<T>(
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

      forgeDebug({
        scope: 'ltm',
        level: 'info',
        message: 'ltm recall operation failed or timed out',
        context: {
          agentId: this.agentId,
          label,
          timeoutMs,
          settled,
          pendingRecallOperationCount: this.pendingRecallOperationCount,
          lingeringRecallOperationSince:
            this.lingeringRecallOperationSince !== undefined
              ? new Date(this.lingeringRecallOperationSince!).toISOString()
              : null,
          error: errorMsg(error),
        },
      });
      throw error;
    }
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
    return await this.persistence.getIndexStats();
  }

  private async queryVectorIndex(
    queryVector: number[],
    topK: number,
  ): Promise<
    Array<{
      id: string;
      text: string;
      score: number;
      metadata?: Record<string, unknown>;
    }>
  > {
    return await runVectorQuery(queryVector, topK, {
      retrievalWorkspace: this.retrievalWorkspace,
      recallTimeoutMs: this.recallTimeoutMs,
      runTrackedRecallOperation: this.runTrackedRecallOperation.bind(this),
    });
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

    if (value === null || value === undefined || typeof value !== 'object') {
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
    if (result === null || result === undefined || typeof result !== 'object') {
      return null;
    }

    const relevantContext = (result as Record<string, unknown>).relevantContext;

    if (typeof relevantContext === 'string') {
      return relevantContext;
    }

    if (Array.isArray(relevantContext)) {
      return relevantContext
        .map((value) => (typeof value === 'string' ? value : ''))
        .filter(Boolean)
        .join('\n\n');
    }

    return null;
  }

  private readGraphSources(result: unknown) {
    if (result === null || result === undefined || typeof result !== 'object') {
      return [];
    }

    const sources = (result as Record<string, unknown>).sources;
    return Array.isArray(sources) ? sources : [];
  }

  private readGraphSourceDocument(source: unknown) {
    if (source === null || source === undefined || typeof source !== 'object') {
      return '';
    }

    const document = (source as Record<string, unknown>).document;
    return typeof document === 'string' ? document.trim() : '';
  }

  private buildRecallQueryFromStep(step: unknown) {
    if (step === null || step === undefined || typeof step !== 'object') {
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
          if (toolCall === null || toolCall === undefined || typeof toolCall !== 'object') {
            return '';
          }

          const recordToolCall = toolCall as Record<string, unknown>;
          const toolName =
            typeof recordToolCall.toolName === 'string' ? recordToolCall.toolName : 'unknown';
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
          if (toolResult === null || toolResult === undefined || typeof toolResult !== 'object') {
            return '';
          }

          const recordToolResult = toolResult as Record<string, unknown>;
          const toolName =
            typeof recordToolResult.toolName === 'string' ? recordToolResult.toolName : 'unknown';
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
    await this.persistence.persistRecallSnapshot(threadContext, snapshot, history);
  }

  private async persistRecallSnapshotWithInput(
    input: { step: unknown; steps: unknown[]; threadId: string | null; resourceId?: string },
    deps: {
      queryText?: string;
      recallConfig?: LtmSnapshotDeps['recallConfig'];
      indexStats?: LtmSnapshotDeps['indexStats'];
      dedupedGraph?: LtmSnapshotDeps['dedupedGraph'];
      filteredResults?: LtmSnapshotDeps['filteredResults'];
      history?: LongTermMemoryRecallHistory;
      status: 'miss' | 'hit' | 'error';
      error?: string;
    },
  ) {
    const threadContext = {
      threadId: input.threadId,
      resourceId: input.resourceId,
    };
    const snapshot = buildLtmRecallSnapshot(
      {
        lastInitAt: this.lastInitAt,
        steps: input.steps,
        queryText: deps.queryText,
        recallConfig: deps.recallConfig,
        indexStats: deps.indexStats,
        dedupedGraph: deps.dedupedGraph,
        filteredResults: deps.filteredResults,
      },
      threadContext,
      { status: deps.status, error: deps.error },
    );
    await this.persistRecallSnapshot(threadContext, snapshot, deps.history);
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

    const recallItemCount = input.graph.hit ? input.graph.sourcesCount : input.results.length;

    if (recallItemCount <= 0) {
      return false;
    }

    const limit = Math.max(
      1,
      Math.floor(input.rawWindowMessageCount * RECALL_INJECTION_RAW_WINDOW_RATIO),
    );
    return recallItemCount >= limit;
  }

  private async readRecallThreadState(threadId: string | null) {
    return await this.persistence.readRecallThreadState(threadId, this.recentRawTokens);
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