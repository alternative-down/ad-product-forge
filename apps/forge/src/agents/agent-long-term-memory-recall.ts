import path from 'node:path';

import type { AgentConfig } from '@mastra/core/agent';
import { LocalFilesystem, Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import { LibSQLVector, type LibSQLStore } from '@mastra/libsql';

import { toMastraSafeIdentifier } from '@mastra-engine/core';

import { embedTextWithFastembed } from '@mastra-engine/core';

type SearchResult = {
  id: string;
  content: string;
  score?: number;
};

const RECALL_METADATA_KEY = 'forgeLongTermMemoryRecall';

type RecallSnapshot = {
  status: 'hit' | 'miss' | 'error';
  query: string;
  resultIds: string[];
  resultCount: number;
  stepsJson: string;
  updatedAt: string;
  error: string | null;
};

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
  private initializationPromise: Promise<void> | null = null;

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

    this.vectorStore = new LibSQLVector({
      id: `${toMastraSafeIdentifier(input.mastraId)}_memory_recall_vector`,
      url: `file:${vectorStorePath}`,
    });
    this.searchIndexName = `${toMastraSafeIdentifier(input.mastraId)}_memory_recall_search`;
    this.memoryStore = memoryStore;
    this.workspace = new WorkspaceRuntime({
      autoSync: true,
      bm25: true,
      autoIndexPaths: ['/workspace-memory/memory'],
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
      await this.doInitialize();
      const queryText = this.buildRecallQueryFromStep(input.step);

      if (!queryText) {
        await this.persistRecallSnapshot({
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, {
          status: 'miss',
          query: '',
          resultIds: [],
          resultCount: 0,
          stepsJson: safeSerializeRecallSteps(input.steps),
          updatedAt: new Date().toISOString(),
          error: 'No current step content was available for the recall query.',
        });
        return null;
      }

      const { formatted, results } = await this.searchWorkspace(queryText);

      if (!formatted) {
        await this.persistRecallSnapshot({
          threadId: input.threadId,
          resourceId: input.resourceId,
        }, {
          status: 'miss',
          query: queryText,
          resultIds: [],
          resultCount: 0,
          stepsJson: safeSerializeRecallSteps(input.steps),
          updatedAt: new Date().toISOString(),
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
        stepsJson: safeSerializeRecallSteps(input.steps),
        updatedAt: new Date().toISOString(),
        error: null,
      });

      return [
        'These are retrieved documents from your maintained long-term memory.',
        'Treat them as useful background context, but still verify against newer thread context and current workspace state when needed.',
        '',
        formatted,
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
        stepsJson: safeSerializeRecallSteps(input.steps),
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  private async doInitialize() {
    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        await withTimeout(
          this.workspace.init(),
          this.initTimeoutMs,
          'ltm recall workspace init timed out',
        );
        await withTimeout(
          this.createWorkspaceVectorIndexIfMissing(),
          this.initTimeoutMs,
          'ltm recall vector index initialization timed out',
        );
      })().catch((error) => {
        this.initializationPromise = null;
        throw error;
      });
    }

    await this.initializationPromise;
  }

  private async createWorkspaceVectorIndexIfMissing() {
    try {
      await this.vectorStore.describeIndex({ indexName: this.searchIndexName });
    } catch {
      const sampleEmbedding = await embedTextWithFastembed('memory-bootstrap');
      const dimension = sampleEmbedding.length;

      await this.vectorStore.createIndex({
        indexName: this.searchIndexName,
        dimension,
        metric: 'cosine',
      });
    }
  }

  private async searchWorkspace(queryText: string): Promise<{ formatted: string; results: SearchResult[] }> {
    try {
      const results = await withTimeout(
        this.workspace.search(queryText, {
          topK: 4,
          mode: 'hybrid',
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
              ? (toolCall as Record<string, unknown>).input
              : null,
          ),
        )
        .filter(Boolean)
        .join(' '),
      toolResults
        .map((toolResult) =>
          this.extractValueText(
            typeof toolResult === 'object' && toolResult !== null
              ? (toolResult as Record<string, unknown>).output
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
