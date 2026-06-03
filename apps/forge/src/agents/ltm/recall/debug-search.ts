import { embedTextWithWorkspaceEmbedder, type WorkspaceEmbedderId } from '@forge-runtime/core';

import { buildRecallSystemMessage } from '../helpers';
import type { AgentLongTermMemoryRecallDebugSearchInput, AgentLongTermMemoryRecallDebugSearchResult } from './types';
import type { RecallOrchestrator } from './orchestrator';
import type { VectorSearchResult } from './vector-search';

/**
 * Minimal structural interface for what DebugSearch needs from the index state.
 * Allows stacking with PR #2 (index-manager) without coupling to its concrete class.
 * Compatible with `IndexManager` (post-#5394 merge) and any other class that
 * exposes these two methods.
 */
export interface DebugSearchIndexStateProvider {
  getLastInitAt(): string | null;
  getWorkspaceIndexState(): Promise<{
    availableIndexes: string[];
    activeIndexStats: { dimension: number; count: number; metric: string | null } | null;
    [key: string]: unknown;
  }>;
}

/**
 * DebugSearch
 *
 * Encapsulates the debugSearch flow — exposes a search query through the
 * recall pipeline and returns a rich result with workspace, vector, and graph
 * dimensions for debugging.
 *
 * Extracted from `recall.ts` (#5352) — third of four planned extractions.
 */
export interface DebugSearchDeps {
  indexState: DebugSearchIndexStateProvider;
  orchestrator: RecallOrchestrator;
  workspaceEmbedder: WorkspaceEmbedderId;
  queryVectorIndex: (embedding: number[], topK: number) => Promise<VectorSearchResult[]>;
}

export class DebugSearch {
  constructor(private readonly deps: DebugSearchDeps) {}

  /**
   * Run a debug search and return a rich result object.
   * If `input.query` is empty, returns a stub result with empty arrays.
   */
  async search(
    input: AgentLongTermMemoryRecallDebugSearchInput,
  ): Promise<AgentLongTermMemoryRecallDebugSearchResult> {
    const indexState = await this.deps.indexState.getWorkspaceIndexState();
    const query = input.query.trim();
    const recallConfig = await this.deps.orchestrator.resolveRecallConfig();

    if (!query) {
      return {
        query: '',
        topK: recallConfig.documentCount,
        searchMode: recallConfig.searchMode,
        graphTopK: recallConfig.documentCount,
        graphThreshold: recallConfig.scoreThreshold,
        graphScore: null,
        graphRandomWalkSteps: recallConfig.graphRandomWalkSteps,
        lastInitAt: this.deps.indexState.getLastInitAt(),
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

    const recallSearch = await this.deps.orchestrator.runRecallSearch(query, recallConfig);
    const queryEmbedding = await embedTextWithWorkspaceEmbedder(this.deps.workspaceEmbedder, query);
    const {
      formatted: workspaceFormattedContext,
      results,
      rawWorkspaceResults,
      graph: graphSearch,
      effectiveGraphTopK: _effectiveGraphTopK,
      effectiveGraphThreshold: _effectiveGraphThreshold,
    } = recallSearch;
    const vectorResults = await this.deps.queryVectorIndex(queryEmbedding, recallConfig.documentCount);
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
      lastInitAt: this.deps.indexState.getLastInitAt(),
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
}

export function createDebugSearch(deps: DebugSearchDeps) {
  return new DebugSearch(deps);
}
