import path from 'node:path';

import type { AgentConfig, MessageList } from '@mastra/core/agent';
import type {
  ProcessInputArgs,
  ProcessInputStepArgs,
  Processor,
} from '@mastra/core/processors';
import { LocalFilesystem, Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import { LibSQLVector, type LibSQLStore } from '@mastra/libsql';

import { toMastraSafeIdentifier } from '@mastra-engine/core';

import { embedTextWithFastembed } from '@mastra-engine/core';

type SearchResult = {
  id: string;
  content: string;
  score?: number;
};

const RECALL_TAG = 'agent-long-term-memory-recall';
const RECALL_METADATA_KEY = 'forgeLongTermMemoryRecall';

type RecallSnapshot = {
  status: 'hit' | 'miss' | 'error';
  query: string;
  resultIds: string[];
  resultCount: number;
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

export class AgentLongTermMemoryRecallProcessor
  implements Processor<'agent-long-term-memory-recall'>
{
  readonly id = 'agent-long-term-memory-recall' as const;
  readonly name = 'Agent Long-Term Memory Recall';

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

  async processInputStep(args: ProcessInputStepArgs<unknown>) {
    if (!args.messageList) {
      return args.messages;
    }

    const threadContext = this.getThreadContext(args.requestContext, args.messageList);

    try {
      await this.doInitialize();
      const queryText = this.buildRecallQuery(args);

      if (!queryText) {
        await this.persistRecallSnapshot(threadContext, {
          status: 'miss',
          query: '',
          resultIds: [],
          resultCount: 0,
          updatedAt: new Date().toISOString(),
          error: 'No current step content was available for the recall query.',
        });
        return args.messageList;
      }

      const { formatted, results } = await this.searchWorkspace(queryText);
      args.messageList.clearSystemMessages(RECALL_TAG);

      if (!formatted) {
        await this.persistRecallSnapshot(threadContext, {
          status: 'miss',
          query: queryText,
          resultIds: [],
          resultCount: 0,
          updatedAt: new Date().toISOString(),
          error: null,
        });
        return args.messageList;
      }

      args.messageList.addSystem(
        [
          'These are retrieved documents from your maintained long-term memory.',
          'Treat them as useful background context, but still verify against newer thread context and current workspace state when needed.',
          '',
          formatted,
        ].join('\n'),
        RECALL_TAG,
      );

      await this.persistRecallSnapshot(threadContext, {
        status: 'hit',
        query: queryText,
        resultIds: results.map((result) => result.id),
        resultCount: results.length,
        updatedAt: new Date().toISOString(),
        error: null,
      });

      return args.messageList;
    } catch (error) {
      console.error('[AgentLongTermMemoryRecall] recall failed:', error);
      args.messageList.clearSystemMessages(RECALL_TAG);
      await this.persistRecallSnapshot(threadContext, {
        status: 'error',
        query: this.buildRecallQuery(args),
        resultIds: [],
        resultCount: 0,
        updatedAt: new Date().toISOString(),
        error: error instanceof Error ? error.message : String(error),
      });
      return args.messageList;
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

  private buildRecallQuery(args: ProcessInputStepArgs<unknown>) {
    const currentStep = args.steps.at(-1);

    if (!currentStep) {
      return '';
    }

    return [
      currentStep.text,
      currentStep.reasoningText ?? '',
      currentStep.toolCalls.map((toolCall) => this.extractValueText(toolCall.input)).filter(Boolean).join(' '),
      currentStep.toolResults.map((toolResult) => this.extractValueText(toolResult.output)).filter(Boolean).join(' '),
    ]
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  private getThreadContext(
    requestContext: ProcessInputArgs['requestContext'],
    messageList: MessageList,
  ) {
    const memoryContext = requestContext?.get('MastraMemory') as
      | { thread?: { id: string }; resourceId?: string }
      | undefined;

    if (memoryContext?.thread?.id) {
      return {
        threadId: memoryContext.thread.id,
        resourceId: memoryContext.resourceId,
      };
    }

    const serialized = messageList.serialize();
    if (serialized.memoryInfo?.threadId) {
      return {
        threadId: serialized.memoryInfo.threadId,
        resourceId: serialized.memoryInfo.resourceId,
      };
    }

    return null;
  }

  private async persistRecallSnapshot(
    threadContext: { threadId: string; resourceId?: string } | null,
    snapshot: RecallSnapshot,
  ) {
    if (!threadContext) {
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

export function createAgentLongTermMemoryRecallProcessor(input: {
  agentId: string;
  agentWorkspacePath: string;
  mastraId: string;
  storage: LibSQLStore;
  model?: AgentConfig['model'];
}) {
  return new AgentLongTermMemoryRecallProcessor(input);
}
