import path from 'node:path';
import fs from 'node:fs/promises';

import type { AgentConfig } from '@mastra/core/agent';
import type { MastraToolInvocationOptions } from '@mastra/core/tools';
import { LocalFilesystem, Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import { LibSQLVector, type LibSQLStore } from '@mastra/libsql';
import { createGraphRAGTool } from '@mastra/rag';

import { toMastraSafeIdentifier } from '@mastra-engine/core';

import { embedTextWithFastembed, getFastembedSingleton } from '@mastra-engine/core';

type SearchResult = {
  id: string;
  content: string;
  score?: number;
};

export type AgentLongTermMemoryRecallDebugSearchInput = {
  query: string;
  topK: number;
  searchMode: 'hybrid' | 'vector' | 'bm25';
  graphTopK: number;
  graphThreshold: number;
  graphRandomWalkSteps: number;
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
  graphContext: string;
};

const RECALL_METADATA_KEY = 'forgeLongTermMemoryRecall';
const RECALL_AUTO_INDEX_PATHS = [
  '.',
] as const;
const RECALL_SEARCH_TOP_K = 3;
const RECALL_SEARCH_MODE = 'hybrid' as const;
const RECALL_GRAPH_TOP_K = 3;
const RECALL_GRAPH_THRESHOLD = 0.4;
const RECALL_GRAPH_RANDOM_WALK_STEPS = 50;

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
  private readonly agentWorkspacePath: string;
  private vectorIndexReadyPromise: Promise<void> | null = null;
  private lastInitAt: string | null = null;

  constructor(input: {
    agentId: string;
    agentWorkspacePath: string;
    agentMemoryPath: string;
    mastraId: string;
    storage: LibSQLStore;
    model?: AgentConfig['model'];
  }) {
    const memoryStore = input.storage.stores.memory;

    if (!memoryStore) {
      throw new Error(`LTM recall memory store is not available for agent ${input.agentId}`);
    }

    const vectorStorePath = path.resolve(input.agentWorkspacePath, `${input.agentId}-memory-recall.db`);
    this.agentWorkspacePath = input.agentWorkspacePath;
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
      embedder: embedTextWithFastembed,
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
          topK: RECALL_SEARCH_TOP_K,
          graphTopK: RECALL_GRAPH_TOP_K,
          graphThreshold: RECALL_GRAPH_THRESHOLD,
          graphRandomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
          indexPaths: [...RECALL_AUTO_INDEX_PATHS],
          workspaceFileCount: indexStats.workspaceFileCount,
          memoryFileCount: indexStats.memoryFileCount,
          checkpointFileCount: indexStats.checkpointFileCount,
          error: 'No current step content was available for the recall query.',
        });
        return null;
      }

      const { formatted, results } = await this.searchWorkspace(queryText);
      const graphContext = await this.searchGraph(queryText, results);
      const recallText = [formatted, graphContext].filter(Boolean).join('\n\n');

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
          topK: RECALL_SEARCH_TOP_K,
          graphTopK: RECALL_GRAPH_TOP_K,
          graphThreshold: RECALL_GRAPH_THRESHOLD,
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
        resultIds: results.map((result) => result.id),
        resultCount: results.length,
        resultScores: results.map((result) => result.score ?? 0),
        graphHit: Boolean(graphContext),
        stepsJson: safeSerializeRecallSteps(input.steps),
        updatedAt: new Date().toISOString(),
        lastInitAt: this.lastInitAt,
        searchMode: RECALL_SEARCH_MODE,
        topK: RECALL_SEARCH_TOP_K,
        graphTopK: RECALL_GRAPH_TOP_K,
        graphThreshold: RECALL_GRAPH_THRESHOLD,
        graphRandomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
        indexPaths: [...RECALL_AUTO_INDEX_PATHS],
        workspaceFileCount: indexStats.workspaceFileCount,
        memoryFileCount: indexStats.memoryFileCount,
        checkpointFileCount: indexStats.checkpointFileCount,
        error: null,
      });

      return [
        'These are retrieved documents from your maintained long-term memory.',
        'Treat them as useful background context, but still verify against newer thread context and current workspace state when needed.',
        '',
        recallText,
      ].join('\n');
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
        topK: RECALL_SEARCH_TOP_K,
        graphTopK: RECALL_GRAPH_TOP_K,
        graphThreshold: RECALL_GRAPH_THRESHOLD,
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

    if (!query) {
      return {
        query: '',
        topK: input.topK,
        searchMode: input.searchMode,
        graphTopK: input.graphTopK,
        graphThreshold: input.graphThreshold,
        graphRandomWalkSteps: input.graphRandomWalkSteps,
        lastInitAt: this.lastInitAt,
        workspaceCanBm25: indexState.workspaceCanBm25,
        workspaceCanVector: indexState.workspaceCanVector,
        workspaceCanHybrid: indexState.workspaceCanHybrid,
        availableIndexes: indexState.availableIndexes,
        activeIndexName: this.searchIndexName,
        activeIndexStats: indexState.activeIndexStats,
        queryEmbedding: [],
        queryEmbeddingDimension: 0,
        workspaceResults: [],
        vectorResults: [],
        graphHit: false,
        graphContext: '',
      } satisfies AgentLongTermMemoryRecallDebugSearchResult;
    }

    const queryEmbedding = await embedTextWithFastembed(query);
    const { results } = await this.searchWorkspace(query, {
      topK: input.topK,
      mode: input.searchMode,
    });
    const vectorResults = await this.queryVectorIndex(queryEmbedding, input.topK);
    const graphContext = await this.searchGraph(query, results, {
      topK: input.graphTopK,
      threshold: input.graphThreshold,
      randomWalkSteps: input.graphRandomWalkSteps,
    });
    const highestScore = results.reduce((currentMax, result) => {
      const score = typeof result.score === 'number' ? result.score : 0;
      return Math.max(currentMax, score);
    }, 0);

    return {
      query,
      topK: input.topK,
      searchMode: input.searchMode,
      graphTopK: input.graphTopK,
      graphThreshold: input.graphThreshold,
      graphRandomWalkSteps: input.graphRandomWalkSteps,
      lastInitAt: this.lastInitAt,
      workspaceCanBm25: indexState.workspaceCanBm25,
      workspaceCanVector: indexState.workspaceCanVector,
      workspaceCanHybrid: indexState.workspaceCanHybrid,
      availableIndexes: indexState.availableIndexes,
      activeIndexName: this.searchIndexName,
      activeIndexStats: indexState.activeIndexStats,
      queryEmbedding,
      queryEmbeddingDimension: queryEmbedding.length,
      workspaceResults: results.map((result) => ({
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
      graphHit: Boolean(graphContext),
      graphContext,
    } satisfies AgentLongTermMemoryRecallDebugSearchResult;
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

    const sampleEmbedding = await embedTextWithFastembed('memory-bootstrap');
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
      topK: RECALL_SEARCH_TOP_K,
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
      const formatted = searchResults
        .map((result) => `${result.id}\n${result.content}`)
        .join('\n\n');

      return { formatted, results: searchResults };
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
    } = {
      topK: RECALL_GRAPH_TOP_K,
      threshold: RECALL_GRAPH_THRESHOLD,
      randomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
    },
  ) {
    try {
      const graphTool = createGraphRAGTool({
        vectorStore: this.vectorStore,
        indexName: this.searchIndexName,
        model: getFastembedSingleton(),
        graphOptions: {
          threshold: options.threshold,
          randomWalkSteps: options.randomWalkSteps,
        },
      });

      const workspaceContext = workspaceResults
        .map((result) => result.content)
        .filter(Boolean)
        .join('\n');

      const graphResult = await withTimeout(
        graphTool.execute(
          {
            queryText: workspaceContext ? `${queryText}\nContext: ${workspaceContext}` : queryText,
            topK: options.topK,
          },
          {} as MastraToolInvocationOptions,
        ),
        this.recallTimeoutMs,
        'ltm graph search timed out',
      );

      const relevantContext = Array.isArray(graphResult?.relevantContext)
        ? graphResult.relevantContext
          .filter((value: unknown): value is string => typeof value === 'string' && value.trim().length > 0)
          .join('\n\n')
        : typeof graphResult?.relevantContext === 'string'
          ? graphResult.relevantContext
          : '';

      return relevantContext.trim();
    } catch {
      return '';
    }
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
      countFiles(this.agentWorkspacePath, '/workspace-memory'),
      countFiles(this.agentWorkspacePath, '/workspace-memory/memory'),
      countFiles(this.agentWorkspacePath, '/workspace-memory/checkpoints'),
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

export function createAgentLongTermMemoryRecall(input: {
  agentId: string;
  agentWorkspacePath: string;
  agentMemoryPath: string;
  mastraId: string;
  storage: LibSQLStore;
  model?: AgentConfig['model'];
}) {
  return new AgentLongTermMemoryRecall(input);
}
