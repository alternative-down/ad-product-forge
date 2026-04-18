import path from 'node:path';
import fs from 'node:fs/promises';

import type { AgentConfig } from '@mastra/core/agent';
import type { MastraToolInvocationOptions } from '@mastra/core/tools';
import { LocalFilesystem, Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import { LibSQLVector, type LibSQLStore } from '@mastra/libsql';
import { createGraphRAGTool } from '@mastra/rag';

import {
  embedTextWithWorkspaceEmbedder,
  getWorkspaceEmbedderProvider,
  toMastraSafeIdentifier,
  type WorkspaceEmbedderId,
} from '@mastra-engine/core';

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

const RECALL_METADATA_KEY = 'forgeLongTermMemoryRecall';
const RECALL_AUTO_INDEX_PATHS = [
  '.',
] as const;
const RECALL_SEARCH_MODE = 'hybrid' as const;
const RECALL_WORKSPACE_SEARCH_TOP_K = 10;
const RECALL_DOCUMENT_COUNT = 3;
const RECALL_SCORE_THRESHOLD = 0.7;
const RECALL_GRAPH_RANDOM_WALK_STEPS = 100;
const RECALL_GRAPH_INCLUDE_SOURCES = false;

type RecallConfig = {
  scoreThreshold: number;
  documentCount: number;
};

type RecallSnapshot = {
  status: 'hit' | 'miss' | 'error';
  query: string;
  resultIds: string[];
  resultCount: number;
  resultScores: number[];
  graphHit: boolean;
  stepsJson: string;
  updatedAt: string;
  lastInitAt: string | null;
  searchMode: string;
  topK: number;
  graphTopK: number;
  graphThreshold: number;
  graphRandomWalkSteps: number;
  indexPaths: string[];
  workspaceFileCount: number;
  memoryFileCount: number;
  checkpointFileCount: number;
  error: string | null;
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
  private readonly workspace: WorkspaceRuntime;
  private readonly vectorStore: LibSQLVector;
  private readonly searchIndexName: string;
  private readonly memoryStore: NonNullable<LibSQLStore['stores']['memory']>;
  private readonly agentMemoryPath: string;
  private readonly agentWorkspacePath: string;
  private readonly workspaceEmbedder: WorkspaceEmbedderId;
  private readonly recallConfig: RecallConfig;
  private readonly readRuntimeMemorySettings?: () => Promise<{
    ltmRecallScoreThreshold: number;
    ltmRecallDocumentCount: number;
  }>;
  private vectorIndexReadyPromise: Promise<void> | null = null;
  private lastInitAt: string | null = null;

  constructor(input: {
    agentId: string;
    agentWorkspacePath: string;
    agentMemoryPath: string;
    mastraId: string;
    storage: LibSQLStore;
    workspaceEmbedder?: WorkspaceEmbedderId;
    scoreThreshold?: number;
    documentCount?: number;
    readRuntimeMemorySettings?: () => Promise<{
      ltmRecallScoreThreshold: number;
      ltmRecallDocumentCount: number;
    }>;
    model?: AgentConfig['model'];
  }) {
    const memoryStore = input.storage.stores.memory;

    if (!memoryStore) {
      throw new Error(`LTM recall memory store is not available for agent ${input.agentId}`);
    }

    const vectorStorePath = path.resolve(input.agentWorkspacePath, `${input.agentId}-memory-recall.db`);
    this.agentMemoryPath = input.agentMemoryPath;
    this.agentWorkspacePath = input.agentWorkspacePath;
    this.workspaceEmbedder = input.workspaceEmbedder ?? 'fastembed';
    this.recallConfig = {
      scoreThreshold: input.scoreThreshold ?? RECALL_SCORE_THRESHOLD,
      documentCount: input.documentCount ?? RECALL_DOCUMENT_COUNT,
    };
    this.readRuntimeMemorySettings = input.readRuntimeMemorySettings;
    this.vectorStore = new LibSQLVector({
      id: `${toMastraSafeIdentifier(input.mastraId)}_memory_recall_vector`,
      url: `file:${vectorStorePath}`,
    });
    this.searchIndexName = `${toMastraSafeIdentifier(input.mastraId)}_memory_recall_search`;
    this.memoryStore = memoryStore;
    this.workspace = new WorkspaceRuntime({
      autoSync: true,
      bm25: true,
      autoIndexPaths: [...RECALL_AUTO_INDEX_PATHS],
      embedder: (text) => embedTextWithWorkspaceEmbedder(this.workspaceEmbedder, text),
      filesystem: new LocalFilesystem({
        basePath: input.agentMemoryPath,
        allowedPaths: [path.resolve(input.agentWorkspacePath, 'workspace', 'skills')],
      }),
      vectorStore: this.vectorStore,
      searchIndexName: this.searchIndexName,
    });
  }

  async recallFromStep(input: {
    step: unknown;
    steps: unknown[];
    threadId: string | null;
    resourceId?: string;
  }) {
    try {
      await this.refreshWorkspaceIndex();
      const queryText = this.buildRecallQueryFromStep(input.step);
      const indexStats = await this.getIndexStats();
      const recallConfig = await this.resolveRecallConfig();

      if (!queryText) {
        await this.persistRecallSnapshot({
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, {
          status: 'miss',
          query: '',
          resultIds: [],
          resultCount: 0,
          resultScores: [],
          graphHit: false,
          stepsJson: safeSerializeRecallSteps(input.steps),
          updatedAt: new Date().toISOString(),
          lastInitAt: this.lastInitAt,
          searchMode: RECALL_SEARCH_MODE,
          topK: recallConfig.documentCount,
          graphTopK: recallConfig.documentCount,
          graphThreshold: recallConfig.scoreThreshold,
          graphRandomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
          indexPaths: [...RECALL_AUTO_INDEX_PATHS],
          workspaceFileCount: indexStats.workspaceFileCount,
          memoryFileCount: indexStats.memoryFileCount,
          checkpointFileCount: indexStats.checkpointFileCount,
          error: 'No current step content was available for the recall query.',
        });
        return null;
      }

      const recallSearch = await this.runRecallSearch(queryText, recallConfig);
      const { results, graph } = recallSearch;
      const recallText = buildRecallSystemMessage({
        graphHit: graph.hit,
        graphContext: graph.context,
        query: queryText,
        results,
      });

      if (!recallText) {
        await this.persistRecallSnapshot({
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, {
          status: 'miss',
          query: queryText,
          resultIds: [],
          resultCount: 0,
          resultScores: [],
          graphHit: false,
          stepsJson: safeSerializeRecallSteps(input.steps),
          updatedAt: new Date().toISOString(),
          lastInitAt: this.lastInitAt,
          searchMode: RECALL_SEARCH_MODE,
          topK: recallConfig.documentCount,
          graphTopK: recallConfig.documentCount,
          graphThreshold: recallConfig.scoreThreshold,
          graphRandomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
          indexPaths: [...RECALL_AUTO_INDEX_PATHS],
          workspaceFileCount: indexStats.workspaceFileCount,
          memoryFileCount: indexStats.memoryFileCount,
          checkpointFileCount: indexStats.checkpointFileCount,
          error: null,
        });
        return null;
      }

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
        searchMode: RECALL_SEARCH_MODE,
        topK: recallConfig.documentCount,
        graphTopK: recallConfig.documentCount,
        graphThreshold: recallConfig.scoreThreshold,
        graphRandomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
        indexPaths: [...RECALL_AUTO_INDEX_PATHS],
        workspaceFileCount: indexStats.workspaceFileCount,
        memoryFileCount: indexStats.memoryFileCount,
        checkpointFileCount: indexStats.checkpointFileCount,
        error: null,
      });

      return recallText;
    } catch (error) {
      console.error('[AgentLongTermMemoryRecall] recall failed:', error);
      await this.persistRecallSnapshot({
        threadId: input.threadId,
        resourceId: input.resourceId,
      }, {
        status: 'error',
        query: this.buildRecallQueryFromStep(input.step),
        resultIds: [],
        resultCount: 0,
        resultScores: [],
        graphHit: false,
        stepsJson: safeSerializeRecallSteps(input.steps),
        updatedAt: new Date().toISOString(),
        lastInitAt: this.lastInitAt,
        searchMode: RECALL_SEARCH_MODE,
        topK: this.recallConfig.documentCount,
        graphTopK: this.recallConfig.documentCount,
        graphThreshold: this.recallConfig.scoreThreshold,
        graphRandomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
        indexPaths: [...RECALL_AUTO_INDEX_PATHS],
        workspaceFileCount: 0,
        memoryFileCount: 0,
        checkpointFileCount: 0,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  async debugSearch(input: AgentLongTermMemoryRecallDebugSearchInput) {
    await this.refreshWorkspaceIndex();
    const indexState = await this.getWorkspaceIndexState();
    const query = input.query.trim();
    const recallConfig = await this.resolveRecallConfig();

    if (!query) {
      return {
        query: '',
        topK: recallConfig.documentCount,
        searchMode: RECALL_SEARCH_MODE,
        graphTopK: recallConfig.documentCount,
        graphThreshold: recallConfig.scoreThreshold,
        graphRandomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
        lastInitAt: this.lastInitAt,
        workspaceCanBm25: indexState.workspaceCanBm25,
        workspaceCanVector: indexState.workspaceCanVector,
        workspaceCanHybrid: indexState.workspaceCanHybrid,
        availableIndexes: indexState.availableIndexes,
        activeIndexName: this.searchIndexName,
        activeIndexStats: indexState.activeIndexStats,
        queryEmbedding: [],
        queryEmbeddingDimension: 0,
        workspaceFormattedContext: '',
        workspaceResults: [],
        vectorResults: [],
        graphHit: false,
        graphQuery: '',
        graphDimension: 0,
        graphIncludeSources: true,
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
    const vectorResults = await this.queryVectorIndex(queryEmbedding, RECALL_WORKSPACE_SEARCH_TOP_K);
    const highestScore = rawWorkspaceResults.reduce((currentMax, result) => {
      const score = typeof result.score === 'number' ? result.score : 0;
      return Math.max(currentMax, score);
    }, 0);

    return {
      query,
      topK: recallConfig.documentCount,
      searchMode: RECALL_SEARCH_MODE,
      graphTopK: recallConfig.documentCount,
      graphThreshold: recallConfig.scoreThreshold,
      graphRandomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
      lastInitAt: this.lastInitAt,
      workspaceCanBm25: indexState.workspaceCanBm25,
      workspaceCanVector: indexState.workspaceCanVector,
      workspaceCanHybrid: indexState.workspaceCanHybrid,
      availableIndexes: indexState.availableIndexes,
      activeIndexName: this.searchIndexName,
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
      vectorResults: vectorResults.map((result) => ({
        id: result.id,
        score: result.score,
        metadataJson: result.metadata ? JSON.stringify(result.metadata, null, 2) : null,
        document: typeof result.document === 'string' ? result.document : null,
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
    const workspaceSearch = await this.searchWorkspace(queryText);
    const filteredWorkspaceResults = this.filterWorkspaceFallbackResults(
      workspaceSearch.results,
      config.scoreThreshold,
      config.documentCount,
    );
    const graphSearch = await this.searchGraph(queryText, workspaceSearch.results, {
      topK: config.documentCount,
      threshold: config.scoreThreshold,
      randomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
      includeSources: RECALL_GRAPH_INCLUDE_SOURCES,
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
      scoreThreshold: runtimeSettings.ltmRecallScoreThreshold,
      documentCount: runtimeSettings.ltmRecallDocumentCount,
    } satisfies RecallConfig;
  }

  private async refreshWorkspaceIndex() {
    await this.ensureVectorIndexReady();
    await withTimeout(
      this.workspace.init(),
      this.initTimeoutMs,
      'ltm recall workspace init timed out',
    );
    this.lastInitAt = new Date().toISOString();
  }

  private async ensureVectorIndexReady() {
    if (!this.vectorIndexReadyPromise) {
      this.vectorIndexReadyPromise = withTimeout(
        this.createWorkspaceVectorIndexIfMissing(),
        this.initTimeoutMs,
        'ltm recall vector index initialization timed out',
      ).catch((error) => {
        this.vectorIndexReadyPromise = null;
        throw error;
      });
    }

    await this.vectorIndexReadyPromise;
  }

  private async createWorkspaceVectorIndexIfMissing() {
    try {
      await this.vectorStore.describeIndex({ indexName: this.searchIndexName });
      return;
    } catch {
      // Index does not exist yet. Create it below.
    }

    const sampleEmbedding = await embedTextWithWorkspaceEmbedder(this.workspaceEmbedder, 'memory-bootstrap');
    const dimension = sampleEmbedding.length;

    await this.vectorStore.createIndex({
      indexName: this.searchIndexName,
      dimension,
      metric: 'cosine',
    });
  }

  private async searchWorkspace(
    queryText: string,
    options: {
      topK: number;
      mode: 'hybrid' | 'vector' | 'bm25';
    } = {
      topK: RECALL_WORKSPACE_SEARCH_TOP_K,
      mode: RECALL_SEARCH_MODE,
    },
  ): Promise<{ formatted: string; results: SearchResult[] }> {
    try {
      const results = await withTimeout(
        this.workspace.search(queryText, {
          topK: options.topK,
          mode: options.mode,
        }),
        this.recallTimeoutMs,
        'ltm recall workspace search timed out',
      );

      if (results.length === 0) {
        return { formatted: '', results: [] };
      }

      const searchResults: SearchResult[] = results.map((result) => ({
        id: result.id,
        content: String(result.content).trim(),
        score: result.score,
      }));
      return { formatted: '', results: searchResults };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('SQLITE_ERROR: no such table') || message.includes('no such table:')) {
        return { formatted: '', results: [] };
      }

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
      topK: RECALL_DOCUMENT_COUNT,
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
    const workspaceContextBase = options.contextResults.length > 0
      ? options.contextResults
      : workspaceResults;
    const workspaceContext = workspaceContextBase
      .map((result) => result.content)
      .filter(Boolean)
      .join('\n');
    const graphQueryText = workspaceContext ? `${queryText}\nContext: ${workspaceContext}` : queryText;
    const graphDimension = await this.getGraphDimension();
    const includeSources = options.includeSources;

    try {
      const graphTool = createGraphRAGTool({
        vectorStore: this.vectorStore,
        indexName: this.searchIndexName,
        model: getWorkspaceEmbedderProvider(this.workspaceEmbedder),
        includeSources,
        graphOptions: {
          dimension: graphDimension,
          threshold: options.threshold,
          randomWalkSteps: options.randomWalkSteps,
        },
      });

      const graphResult = await withTimeout(
        graphTool.execute(
          {
            queryText: graphQueryText,
            topK: options.topK,
          },
          {} as MastraToolInvocationOptions,
        ),
        this.recallTimeoutMs,
        'ltm graph search timed out',
      );

      const relevantContextRaw = this.readGraphRelevantContext(graphResult);
      const sources = this.readGraphSources(graphResult);
      const context = relevantContextRaw?.trim()
        || sources
          .map((source) => this.readGraphSourceDocument(source))
          .filter(Boolean)
          .join('\n\n');

      return {
        queryText: graphQueryText,
        dimension: graphDimension,
        includeSources,
        hit: sources.length > 0 || Boolean(context.trim()),
        context: context.trim(),
        relevantContextRaw,
        sourcesCount: sources.length,
        sourcesJson: safeSerializeGraphResult(sources),
        rawJson: safeSerializeGraphResult(graphResult),
        error: null,
      };
    } catch (error) {
      return {
        queryText: graphQueryText,
        dimension: graphDimension,
        includeSources,
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
    const indexStats = await this.vectorStore.describeIndex({
      indexName: this.searchIndexName,
    }).catch(() => null);

    if (indexStats?.dimension) {
      return indexStats.dimension;
    }

    const sampleEmbedding = await embedTextWithWorkspaceEmbedder(this.workspaceEmbedder, 'memory-bootstrap');
    return sampleEmbedding.length;
  }

  private async getWorkspaceIndexState() {
    const availableIndexes = await this.vectorStore.listIndexes().catch(() => []);
    const activeIndexStats = await this.vectorStore.describeIndex({
      indexName: this.searchIndexName,
    }).then((stats) => ({
      dimension: stats.dimension,
      count: stats.count,
      metric: stats.metric ?? null,
    })).catch(() => null);

    return {
      workspaceCanBm25: this.workspace.canBM25,
      workspaceCanVector: this.workspace.canVector,
      workspaceCanHybrid: this.workspace.canHybrid,
      availableIndexes,
      activeIndexStats,
    };
  }

  private async getIndexStats() {
    const [workspaceFileCount, memoryFileCount, checkpointFileCount] = await Promise.all([
      countFiles(this.agentMemoryPath, '.'),
      countFiles(this.agentMemoryPath, 'memory'),
      countFiles(this.agentMemoryPath, 'checkpoints'),
    ]);

    return {
      workspaceFileCount,
      memoryFileCount,
      checkpointFileCount,
    };
  }

  private async queryVectorIndex(queryVector: number[], topK: number) {
    try {
      return await withTimeout(
        this.vectorStore.query({
          indexName: this.searchIndexName,
          queryVector,
          topK,
        }),
        this.recallTimeoutMs,
        'ltm vector query timed out',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (message.includes('SQLITE_ERROR: no such table') || message.includes('no such table:')) {
        return [];
      }

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
    snapshot: RecallSnapshot,
  ) {
    if (!threadContext.threadId) {
      return;
    }

    const thread = await this.memoryStore.getThreadById({
      threadId: threadContext.threadId,
    });
    const metadata = thread?.metadata && typeof thread.metadata === 'object'
      ? { ...thread.metadata }
      : {};

    metadata[RECALL_METADATA_KEY] = snapshot;

    await this.memoryStore.updateThread({
      id: threadContext.threadId,
      title: thread?.title ?? '',
      metadata,
    });
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
    `  <instructions>${escapeXml('Now is the datetime in the on-datetime attribute. These recalled items are past information that is no longer in your active context or that your long-term memory consolidated. You may already have seen or resolved them. Use them only as additional relevant context when useful, and prefer more recent context if there is any conflict.')}</instructions>`,
    ...items,
    '</memory-recall>',
  ].join('\n');
}

export function createAgentLongTermMemoryRecall(input: {
  agentId: string;
  agentWorkspacePath: string;
  agentMemoryPath: string;
  mastraId: string;
  storage: LibSQLStore;
  workspaceEmbedder?: WorkspaceEmbedderId;
  scoreThreshold?: number;
  documentCount?: number;
  readRuntimeMemorySettings?: () => Promise<{
    ltmRecallScoreThreshold: number;
    ltmRecallDocumentCount: number;
  }>;
  model?: AgentConfig['model'];
}) {
  return new AgentLongTermMemoryRecall(input);
}
