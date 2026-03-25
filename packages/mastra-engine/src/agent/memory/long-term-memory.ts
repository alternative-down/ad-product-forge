import path from 'node:path';

import { Agent } from '@mastra/core/agent';
import type { AgentConfig } from '@mastra/core/agent';
import type { MastraDBMessage, MessageList } from '@mastra/core/agent';
import type {
  ProcessInputStepArgs,
  ProcessOutputStepArgs,
  Processor,
} from '@mastra/core/processors';
import { LocalFilesystem, LocalSandbox, Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import { fastembed } from '@mastra/fastembed';
import { LibSQLVector } from '@mastra/libsql';
import { createGraphRAGTool } from '@mastra/rag';
import { ObservationalMemory } from '@mastra/memory/processors';

import { forgeDebug } from '../../debug';
import { embedTextWithFastembed } from './embedder';

type ObservationRecord = Awaited<ReturnType<ObservationalMemory['getHistory']>>[number];

export type LongTermMemoryConfig = {
  om: ObservationalMemory;
  agentId: string;
  omModel: AgentConfig['model'];
  memoryBasePath?: string;
};

export class LongTermMemory implements Processor<'long-term-memory'> {
  readonly id = 'long-term-memory';
  readonly name = 'Long Term Memory';
  private readonly memoryDir = 'memory';
  private readonly observationsDir = 'observations';
  private readonly archivedDir = 'archived';
  private readonly maxRecentRecallMessages = 8;

  private readonly om: ObservationalMemory;
  private readonly workspace: WorkspaceRuntime;
  private readonly vectorStore: LibSQLVector;
  private readonly searchIndexName: string;
  private readonly omModel: AgentConfig['model'];
  private memoryAgent: Agent<string, never, string> | null = null;
  private initialized = false;

  constructor(config: LongTermMemoryConfig) {
    this.om = config.om;

    const memoryPath =
      config.memoryBasePath ||
      path.resolve(process.cwd(), '.forge-memory', config.agentId);

    const vectorStorePath = path.join(memoryPath, config.agentId + '-memory-workspace.db');
    this.vectorStore = new LibSQLVector({
      id: config.agentId + '-memory-workspace-vector',
      url: 'file:' + vectorStorePath,
    });

    this.searchIndexName = config.agentId + '_memory_search';

    this.workspace = new WorkspaceRuntime({
      autoSync: true,
      bm25: true,
      autoIndexPaths: ['/observations', '/memory'],
      embedder: embedTextWithFastembed,
      filesystem: new LocalFilesystem({ basePath: memoryPath }),
      sandbox: new LocalSandbox({ isolation: 'none', workingDirectory: memoryPath }),
      vectorStore: this.vectorStore,
      searchIndexName: this.searchIndexName,
    });
  }

  private async ensureInitialized() {
    if (this.initialized) {
      return;
    }

    await this.workspace.init();
    await this.createWorkspaceVectorIndexIfMissing(this.vectorStore, this.searchIndexName);
    this.initialized = true;

    this.memoryAgent = new Agent({
      id: this.id + '-agent',
      name: 'Memory Consolidation Agent',
      instructions:
        'You are the unconscious of an LLM agent responsible for organizing, inferring, and registering memories from raw data. You have access to three directories: /memory (organized knowledge), /observations (raw observations), /archived (archived observations). Your task is to read /observations, extract insights, learnings, processes, and key information, create organized files in /memory with meaningful names, and move processed observations to /archived.',
      model: this.omModel,
      workspace: this.workspace,
    });

    this.cleanupConsolidatedFiles().catch((error: unknown) => {
      forgeDebug('ltm', 'cleanup failed', { error: String(error) });
    });

    forgeDebug('ltm', 'initialized');
  }

  private async createWorkspaceVectorIndexIfMissing(vectorStore: LibSQLVector, indexName: string) {
    try {
      await vectorStore.describeIndex({ indexName });
    } catch {
      const sampleEmbedding = await embedTextWithFastembed('forge-memory-bootstrap');
      await vectorStore.createIndex({
        indexName,
        dimension: sampleEmbedding.length,
        metric: 'cosine',
      });
    }
  }

  async processInputStep(args: ProcessInputStepArgs<unknown>) {
    if (!args.messageList) {
      return args.messages;
    }

    await this.ensureInitialized();

    const context = this.getThreadContext(args.requestContext, args.messageList);
    if (!context) {
      return args.messageList;
    }

    const queryText = this.buildRecallQuery(args.messages);

    if (!queryText) {
      return args.messageList;
    }

    const workspaceResults = await this.searchWorkspace(queryText);
    const graphContext = await this.searchGraph(queryText, workspaceResults);
    const sections = [
      workspaceResults ? 'Workspace memory:\n' + workspaceResults : '',
      graphContext ? 'Graph memory:\n' + graphContext : '',
    ].filter(Boolean);

    if (sections.length === 0) {
      return args.messageList;
    }

    args.messageList.addSystem(
      {
        role: 'system',
        content: [
          'Recovered past memory relevant to the current step. Use it as supporting recall, not as a replacement for the current conversation.',
          sections.join('\n\n'),
        ].join('\n\n'),
      },
      this.id,
    );

    return args.messageList;
  }

  async processOutputStep(args: ProcessOutputStepArgs<unknown>) {
    if (!args.messageList) {
      return args.messages;
    }

    await this.ensureInitialized();

    const context = this.getThreadContext(args.requestContext, args.messageList);
    if (!context) {
      return args.messages;
    }

    const currentRecord = await this.om.getRecord(context.threadId, context.resourceId);
    if (!currentRecord) {
      return args.messages;
    }

    const hasObservationsDir =
      (await this.workspace.filesystem?.exists(this.observationsDir)) ?? false;
    const historyLimit = hasObservationsDir ? 12 : Number.MAX_SAFE_INTEGER;
    const observations = await this.om.getHistory(
      context.threadId,
      context.resourceId,
      historyLimit,
    );
    const pendingObservations = observations.filter(
      (observation) => observation.id !== currentRecord.id,
    );

    if (pendingObservations.length === 0) {
      return args.messageList;
    }

    // Save each observation as an individual file (no day grouping)
    for (const observation of pendingObservations) {
      const filePath = path.posix.join(this.observationsDir, observation.id + '.md');
      const content = [
        '# Observation',
        '',
        '## observation:' + observation.id,
        'Type: ' + observation.originType,
        'CreatedAt: ' + observation.createdAt.toISOString(),
        '',
        observation.activeObservations,
      ]
        .filter(Boolean)
        .join('\n');

      await this.workspace.filesystem?.writeFile(filePath, content, {
        recursive: true,
        overwrite: true,
      });
    }

    // Fire-and-forget: call memory agent to organize observations
    this.memoryAgent
      ?.generate(
        {
          messages: [
            {
              role: 'user',
              content:
                'Review the /observations directory, organize insights into /memory, and archive processed files in /archived.',
            },
          ],
        },
        { threadId: context.threadId, resourceId: context.resourceId },
      )
      .catch((error: unknown) => {
        forgeDebug('ltm', 'memory agent call failed', { error: String(error) });
      });

    return args.messageList;
  }

  private async readFile(filePath: string) {
    const exists = (await this.workspace.filesystem?.exists(filePath)) ?? false;
    if (!exists) {
      return '';
    }
    const content = await this.workspace.filesystem?.readFile(filePath);
    if (typeof content === 'string') {
      return content;
    }
    return content?.toString('utf8') ?? '';
  }

  private async searchWorkspace(queryText: string) {
    try {
      const results = await this.workspace.search(queryText, {
        topK: 3,
        mode: 'hybrid',
      });

      forgeDebug('ltm', 'workspace search completed', {
        resultCount: results.length,
      });

      if (results.length === 0) {
        return '';
      }

      return results
        .map((result) => result.id + '\n' + String(result.content).trim())
        .join('\n\n---\n\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('SQLITE_ERROR: no such table') || message.includes('no such table:')) {
        return '';
      }
      forgeDebug('ltm', 'workspace search failed', { error: message });
      return '';
    }
  }

  private async searchGraph(queryText: string, workspaceResults: SearchResult[]) {
    try {
      const graphTool = createGraphRAGTool({
        vectorStore: this.vectorStore,
        indexName: this.searchIndexName,
        model: fastembed,
        graphOptions: {
          threshold: 0.7,
          randomWalkSteps: 50,
        },
      });

      const workspaceContext = workspaceResults
        .map((r) => r.id + ': ' + r.content)
        .join('\n\n');

      const graphResult = await graphTool.execute(
        {
          queryText: workspaceContext ? queryText + '\n\nContext:\n' + workspaceContext : queryText,
          topK: 3,
        },
        {} as never,
      );
      const relevantContext = Array.isArray(graphResult?.relevantContext)
        ? graphResult.relevantContext
        : [];

      forgeDebug('ltm', 'graph search completed', {
        resultCount: relevantContext.length,
      });

      return relevantContext
        .map((chunk: unknown) =>
          typeof chunk === 'string' ? chunk.trim() : JSON.stringify(chunk).trim(),
        )
        .filter(Boolean)
        .join('\n\n---\n\n');
    } catch (error) {
      forgeDebug('ltm', 'graph search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
  }

  private buildRecallQuery(messages: MastraDBMessage[]) {
    return messages
      .filter((message) => ['user', 'assistant', 'tool'].includes(message.role))
      .slice(-this.maxRecentRecallMessages)
      .map((message) => {
        let text = '';
        if (typeof message.content === 'string') {
          text = message.content;
        } else if (Array.isArray(message.content)) {
          text = message.content
            .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
            .join('\n');
        } else {
          const parts = Array.isArray(message.content?.parts) ? message.content.parts : [];
          text = parts
            .map((part) =>
              'text' in part && typeof part.text === 'string' ? part.text : JSON.stringify(part),
            )
            .join('\n');
        }
        text = text.trim();
        return text ? '[' + message.role + '] ' + text : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  private getThreadContext(
    requestContext: { get(key: string): unknown; has(key: string): boolean },
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

  /**
   * Delete previously consolidated files from /memory directory.
   */
  private async cleanupConsolidatedFiles(): Promise<void> {
    try {
      const memoryDirPath = path.posix.join(
        this.workspace.filesystem?.basePath || '',
        this.memoryDir,
      );
      const memoryDirExists = await this.workspace.filesystem?.exists(memoryDirPath);
      if (!memoryDirExists) {
        return;
      }

      const files = (await this.workspace.filesystem?.listFiles(memoryDirPath)) || [];
      const consolidatedFiles = files.filter((f) => f.includes('/consolidated-'));

      for (const filePath of consolidatedFiles) {
        await this.workspace.filesystem?.deleteFile(filePath);
      }
    } catch (error) {
      forgeDebug('ltm', 'cleanup failed', { error: String(error) });
    }
  }
}

type SearchResult = {
  id: string;
  content: string;
  score?: number;
};
