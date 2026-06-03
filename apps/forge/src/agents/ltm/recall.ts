import path from 'node:path';

import {
  type ConversationStore,
  embedTextWithWorkspaceEmbedder,
  FilesystemDocumentSource,
  forgeDebug,
  
  SqliteWorkspaceRetrieval,
  type WorkspaceEmbedderId,
} from '@forge-runtime/core';
import { errorMsg } from '../error-formatting';
import { RecallPersistence, createRecallPersistence } from './recall/persistence';
import { createInFlightRecallTracker, InFlightRecallTracker } from './recall/in-flight-tracker';
import { createIndexManager, IndexManager } from './recall/index-manager';
import { createDebugSearch, DebugSearch } from './recall/debug-search';
import {
  buildRecallQueryFromStep,
  shouldSkipRecallInjection,
} from './recall/query-helpers';

/** Input shape for LTM recall step. Concrete type matching buildRecallStepFromIteration output. */
export interface RecallStepInput {
  text: string;
  toolCalls: Array<{ toolName: string; args: Record<string, unknown> }>;
  toolResults: Array<{ toolName: string; result: unknown }>;
}

export interface RecallFromStepInput {
  step: RecallStepInput;
  steps: RecallStepInput[];
  threadId: string | null;
  resourceId?: string;
}

import type { createAgentLongTermMemoryStore } from './store';

import { buildRecallSystemMessage } from './helpers';
import {
  partitionRecallResults,
  buildNextRecallHistory,
} from './snapshot';
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
  private readonly orchestrator: RecallOrchestrator;
  private readonly persistence: RecallPersistence;
  private readonly inFlightTracker: InFlightRecallTracker;
  private readonly indexManager: IndexManager;
  private readonly debugSearchInstance: DebugSearch;
  private readonly _trackedRecallOperation: <T>(
    label: string,
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ) => Promise<T>;

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

    this.inFlightTracker = createInFlightRecallTracker({ agentId: this.agentId });
    this._trackedRecallOperation = this.inFlightTracker.runTrackedRecallOperation.bind(this.inFlightTracker);

    const orchestratorDeps: RecallOrchestratorDeps = {
      retrievalWorkspace: this.retrievalWorkspace,
      agentId: this.agentId,
      agentWorkspacePath: this.agentWorkspacePath,
      agentMemoryPath: this.agentMemoryPath,
      workspaceEmbedder: this.workspaceEmbedder,
      readRuntimeMemorySettings: this.readRuntimeMemorySettings,
      recallTimeoutMs: this.recallTimeoutMs,
      runTrackedRecallOperation: this._trackedRecallOperation,
    };
    this.orchestrator = createRecallOrchestrator(orchestratorDeps);
    this.persistence = createRecallPersistence({
      persistenceStore: this.persistenceStore,
      conversationStore: this.conversationStore,
      agentWorkspacePath: this.agentWorkspacePath,
      agentMemoryPath: this.agentMemoryPath,
      lastInitAt: null,
    });
    this.indexManager = createIndexManager({
      agentId: this.agentId,
      retrievalWorkspace: this.retrievalWorkspace,
      persistence: this.persistence,
      persistenceStore: this.persistenceStore,
      inFlightTracker: this.inFlightTracker,
      initTimeoutMs: this.initTimeoutMs,
    });
    this.debugSearchInstance = createDebugSearch({
      indexState: this.indexManager,
      orchestrator: this.orchestrator,
      workspaceEmbedder: this.workspaceEmbedder,
      queryVectorIndex: this.queryVectorIndex.bind(this),
    });
  }
  // ─── recallFromStep ────────────────────────────────────────────────────
  //
  // Persistence wrappers (persistMissRecall, persistHitRecall, persistRecallSnapshot,
  // persistRecallSnapshotWithInput, readRecallThreadState) moved to this.persistence (#5352).
  // Query helpers (buildRecallQueryFromStep, shouldSkipRecallInjection) moved to
  // ./recall/query-helpers.

  async recallFromStep(input: RecallFromStepInput) {
    const recallStartedAt = Date.now();

    try {
      if (this.inFlightTracker.isRecallInFlight()) {
        this.inFlightTracker.logInFlightSkip(input.threadId);
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
      const queryText = buildRecallQueryFromStep(input.step);
      const recallThreadState = await this.persistence.readRecallThreadState(input.threadId, this.recentRawTokens);

      if (!queryText) {
        await this.persistence.persistMissRecall(
          { threadId: input.threadId, resourceId: input.resourceId },
          { step: input.step, steps: input.steps },
          recallThreadState.recentFingerprints,
        );
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
      if (shouldSkipRecallInjection({
        graph: { ...graph, sourcesCount: 0 },
        results,
        rawWindowMessageCount: recallThreadState.rawWindowMessageCount ?? 0,
      })) {
        await this.persistence.persistHitRecall(
          { threadId: input.threadId, resourceId: input.resourceId },
          { step: input.step, steps: input.steps },
          { queryText, recallConfig, indexStats, dedupedGraph: graph, filteredResults: results, history: nextHistory }
        );
        return null;
      }

      const recallText = buildRecallSystemMessage({
        graphHit: graph.hit,
        graphScore: graph.score ?? 0,
        graphContext: graph.context,
        query: queryText,
        results,
      });

      if (recallText == null) {
        await this.persistence.persistHitRecall(
          { threadId: input.threadId, resourceId: input.resourceId },
          { step: input.step, steps: input.steps },
          { queryText, recallConfig, indexStats, dedupedGraph: graph, filteredResults: results, history: nextHistory }
        );
        return null;
      }

      await this.persistence.persistHitRecall(
          { threadId: input.threadId, resourceId: input.resourceId },
          { step: input.step, steps: input.steps },
          { queryText, recallConfig, indexStats, dedupedGraph: graph, filteredResults: results, history: nextHistory }
        );

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
          error: errorMsg(error),
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
      const snapshotError = errorMsg(error);
      try {
        await this.persistence.persistRecallSnapshotWithInput(
          { threadId: input.threadId, resourceId: input.resourceId, step: input.step, steps: input.steps },
          {
            status: 'error',
            error: snapshotError,
            history: persistedState?.history ?? undefined,
          },
        );
      } catch (e) {
        forgeDebug({
          scope: 'ltm-recall',
          level: 'warn',
          message: 'persistRecallSnapshot failed',
          context: {
            threadId: input.threadId,
            resourceId: input.resourceId,
            error: errorMsg(e),
          },
        });
      }
      return null;
    }
  }

  dispose(): Promise<void> {
    // The underlying SqliteWorkspaceRetrieval.dispose() is synchronous
    // (closes the db handle). Wrap in Promise.resolve so the
    // InternalAgentRuntime contract (dispose?(): Promise<void>) is
    // satisfied without forcing the method to be marked async (which
    // would trip @typescript-eslint/require-await since there is no
    // await expression inside the body).
    this.retrievalWorkspace.dispose();
    return Promise.resolve();
  }

  /**
   * @deprecated Delegate to this.indexManager.initialize.
   * Kept for backward compat with the public API; will be removed in a future major refactor.
   */
  async initialize(): Promise<void> {
    await this.indexManager.initialize();
  }

  /**
   * @deprecated Delegate to this.indexManager.refreshIndex.
   * Kept for backward compat with the public API; will be removed in a future major refactor.
   */
  async refreshIndex(): Promise<void> {
    await this.indexManager.refreshIndex();
  }

  /**
   * @deprecated Delegate to this.debugSearchInstance.search.
   * Kept for backward compat with the public API; will be removed in a future major refactor.
   */
  async debugSearch(input: AgentLongTermMemoryRecallDebugSearchInput) {
    return await this.debugSearchInstance.search(input);
  }
  /**
   * @deprecated Delegate to this.indexManager.readCurrentIndexStamp.
   */
  private async readCurrentIndexStamp() {
    return await this.indexManager.readCurrentIndexStamp();
  }

  async resolveRecallConfig() {
    return await this.orchestrator.resolveRecallConfig();
  }

  async runRecallSearch(queryText: string, config: RecallConfig) {
    return await this.orchestrator.runRecallSearch(queryText, config);
  }

  /**
   * @deprecated Delegate to this.inFlightTracker.runTrackedRecallOperation.
   * Kept for backward compat with the public API; will be removed in a future major refactor.
   */
  async runTrackedRecallOperation<T>(
    label: string,
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ): Promise<T> {
    return await this.inFlightTracker.runTrackedRecallOperation(label, operation, timeoutMs, timeoutMessage);
  }

  private async getWorkspaceIndexState() {
    return await this.indexManager.getWorkspaceIndexState();
  }

  private async getIndexStats() {
    return await this.indexManager.getIndexStats();
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
      runTrackedRecallOperation: this._trackedRecallOperation,
    });
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