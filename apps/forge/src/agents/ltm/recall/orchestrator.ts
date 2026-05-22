import type { SqliteWorkspaceRetrieval } from '@forge-runtime/core';
import { forgeDebug, embedTextWithWorkspaceEmbedder } from '@forge-runtime/core';
import { serializeError } from '../../agent-runner-error-formatting';
import type { LtmSearchResult } from '../../agent-ltm-helpers';
import type { RecallConfig } from './types';
import { runGraphSearch, type GraphSearchDeps } from './graph-search';
import { runWorkspaceSearch, type WorkspaceSearchDeps } from './workspace-search';

export type { RecallConfig } from './types';

export type { GraphSearchDeps } from './graph-search';
export type { WorkspaceSearchDeps } from './workspace-search';

export type RecallOrchestratorDeps = {
  retrievalWorkspace: SqliteWorkspaceRetrieval;
  agentId: string;
  agentWorkspacePath: string;
  agentMemoryPath: string;
  workspaceEmbedder: string;
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
  recallTimeoutMs: number;
  runTrackedRecallOperation: <T>(
    label: string,
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ) => Promise<T>;
};

export interface RecallSearchResult {
  formatted: string;
  results: LtmSearchResult[];
  rawWorkspaceResults: LtmSearchResult[];
  graph: {
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
  };
  effectiveGraphTopK: number;
  effectiveGraphThreshold: number;
}

export class RecallOrchestrator {
  private readonly retrievalWorkspace: SqliteWorkspaceRetrieval;
  private readonly agentId: string;
  private readonly agentWorkspacePath: string;
  private readonly agentMemoryPath: string;
  private readonly workspaceEmbedder: string;
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
  private readonly recallTimeoutMs: number;
  private readonly runTrackedRecallOperation: <T>(
    label: string,
    operation: Promise<T>,
    timeoutMs: number,
    timeoutMessage: string,
  ) => Promise<T>;

  constructor(deps: RecallOrchestratorDeps) {
    this.retrievalWorkspace = deps.retrievalWorkspace;
    this.agentId = deps.agentId;
    this.agentWorkspacePath = deps.agentWorkspacePath;
    this.agentMemoryPath = deps.agentMemoryPath;
    this.workspaceEmbedder = deps.workspaceEmbedder;
    this.readRuntimeMemorySettings = deps.readRuntimeMemorySettings;
    this.recallTimeoutMs = deps.recallTimeoutMs;
    this.runTrackedRecallOperation = deps.runTrackedRecallOperation;
  }

  async resolveRecallConfig(): Promise<RecallConfig> {
    const runtimeSettings = await this.readRuntimeMemorySettings?.();

    if (!runtimeSettings) {
      forgeDebug({
        scope: 'ltm-recall',
        level: 'warn',
        message: 'recallFromLongTermMemory: runtime memory settings required',
      });
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

  async searchWorkspace(
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
    return runWorkspaceSearch(queryText, options, {
      retrievalWorkspace: this.retrievalWorkspace,
      agentId: this.agentId,
      recallTimeoutMs: this.recallTimeoutMs,
      runTrackedRecallOperation: this.runTrackedRecallOperation,
    });
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
    return runGraphSearch(queryText, workspaceResults, options, {
      retrievalWorkspace: this.retrievalWorkspace,
      agentId: this.agentId,
      recallTimeoutMs: this.recallTimeoutMs,
      runTrackedRecallOperation: this.runTrackedRecallOperation,
      getGraphDimension: this.getGraphDimension.bind(this),
    });
  }

  private async getGraphDimension(): Promise<number> {
    const indexState = await this.retrievalWorkspace.getStats();
    return indexState.activeIndexStats?.dimension ?? 0;
  }

  async runRecallSearch(queryText: string, config: RecallConfig): Promise<RecallSearchResult> {
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
}

export function createRecallOrchestrator(deps: RecallOrchestratorDeps): RecallOrchestrator {
  return new RecallOrchestrator(deps);
}