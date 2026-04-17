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

const RECALL_METADATA_KEY = 'forgeLongTermMemoryRecall';
const RECALL_AUTO_INDEX_PATHS = [
  '/workspace-memory',
  '/workspace-memory/memory',
  '/workspace-memory/checkpoints',
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
  private readonly initTimeoutMs = 5_000;
  private readonly recallTimeoutMs = 8_000;
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
        basePath: input.agentWorkspacePath,
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

  private async searchWorkspace(queryText: string): Promise<{ formatted: string; results: SearchResult[] }> {
    try {
      const results = await withTimeout(
        this.workspace.search(queryText, {
          topK: RECALL_SEARCH_TOP_K,
          mode: RECALL_SEARCH_MODE,
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

  private async searchGraph(queryText: string, workspaceResults: SearchResult[]) {
    try {
      const graphTool = createGraphRAGTool({
        vectorStore: this.vectorStore,
        indexName: this.searchIndexName,
        model: getFastembedSingleton(),
        graphOptions: {
          threshold: RECALL_GRAPH_THRESHOLD,
          randomWalkSteps: RECALL_GRAPH_RANDOM_WALK_STEPS,
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
            topK: RECALL_GRAPH_TOP_K,
          },
          {} as MastraToolInvocationOptions,
        ),
        this.recallTimeoutMs,
        'ltm graph search timed out',
      );

      const relevantContext = typeof graphResult?.relevantContext === 'string'
        ? graphResult.relevantContext
        : '';

      return relevantContext.trim();
    } catch {
      return '';
    }
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

  private extractValueText(value: unknown): string {
    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }

    if (Array.isArray(value)) {
      return value
        .map((item) => this.extractValueText(item))
        .filter(Boolean)
        .join(' ');
    }

    if (!value || typeof value !== 'object') {
      return '';
    }

    return Object.values(value)
      .map((item) => this.extractValueText(item))
      .filter(Boolean)
      .join(' ');
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
        .map((toolCall) =>
          this.extractValueText(
            typeof toolCall === 'object' && toolCall !== null
              ? (
                (toolCall as Record<string, unknown>).args
                ?? (toolCall as Record<string, unknown>).input
              )
              : null,
          ),
        )
        .filter(Boolean)
        .join(' '),
      toolResults
        .map((toolResult) =>
          this.extractValueText(
            typeof toolResult === 'object' && toolResult !== null
              ? (
                (toolResult as Record<string, unknown>).result
                ?? (toolResult as Record<string, unknown>).output
              )
              : null,
          ),
        )
        .filter(Boolean)
        .join(' '),
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
  mastraId: string;
  storage: LibSQLStore;
  model?: AgentConfig['model'];
}) {
  return new AgentLongTermMemoryRecall(input);
}
