import path from 'node:path';

import type { MastraDBMessage, MessageList } from '@mastra/core/agent';
import type {
  ProcessInputArgs,
  ProcessInputStepArgs,
  ProcessOutputStepArgs,
  Processor,
} from '@mastra/core/processors';
import type { Workspace } from '@mastra/core/workspace';
import { LocalFilesystem, Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import { embedTextWithFastembed } from '@mastra/fastembed';
import { LibSQLVector } from '@mastra/libsql';
import { ObservationalMemory } from '@mastra/memory/processors';

import { forgeDebug } from '../../debug';

type ObservationRecord = Awaited<ReturnType<ObservationalMemory['getHistory']>>[number];
const MEMORY_WORKSPACE_ROOT = '.forge-memory';

export type LongTermMemoryConfig = {
  om: ObservationalMemory;
  workspace: Workspace;
  vectorStore: LibSQLVector;
  searchIndexName: string;
};

export class LongTermMemory implements Processor<'long-term-memory'> {
  readonly id = 'long-term-memory';
  readonly name = 'Long Term Memory';
  private readonly observationsDir = 'observations';
  private readonly archivedDir = 'archived';
  private readonly memoryDir = 'memory';
  private readonly maxRecentRecallMessages = 8;
  private readonly bootstrapHistoryLimit = Number.MAX_SAFE_INTEGER;
  private readonly incrementalHistoryLimit = 12;

  private readonly om: ObservationalMemory;
  private readonly workspace: Workspace;
  private readonly vectorStore: LibSQLVector;
  private readonly searchIndexName: string;

  constructor(config: LongTermMemoryConfig) {
    this.om = config.om;
    this.workspace = config.workspace;
    this.vectorStore = config.vectorStore;
    this.searchIndexName = config.searchIndexName;
  }

  static async create(config: {
    agentId: string;
    om: ObservationalMemory;
    memoryBasePath?: string;
  }) {
    const indexName = `${config.agentId}_memory_search`.replace(/[^a-zA-Z0-9_]/g, '_');
    const memoryPath = config.memoryBasePath || path.resolve(process.cwd(), MEMORY_WORKSPACE_ROOT, config.agentId);
    const vectorStorePath = path.resolve(path.dirname(memoryPath), `${config.agentId}-memory-workspace.db`);

    const vectorStore = new LibSQLVector({
      id: `${config.agentId}-memory-workspace-vector`,
      url: `file:${vectorStorePath}`,
    });

    // Clean up any previously consolidated files from /memory directory
    await LongTermMemory.cleanupConsolidatedFiles(memoryPath, indexName, vectorStore);

    const workspace = new WorkspaceRuntime({
      bm25: true,
      autoSync: true,
      autoIndexPaths: ['/observations', '/memory'],
      embedder: embedTextWithFastembed,
      filesystem: new LocalFilesystem({
        basePath: memoryPath,
      }),
      vectorStore,
      searchIndexName: indexName,
    });

    await workspace.init();
    await this.createWorkspaceVectorIndexIfMissing(vectorStore, indexName);

    return new LongTermMemory({
      om: config.om,
      workspace,
      vectorStore,
      searchIndexName: indexName,
    });
  }

  static async createWorkspaceVectorIndexIfMissing(vectorStore: LibSQLVector, indexName: string) {
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

  /**
   * Clean up previously consolidated files from /memory directory.
   * This removes any files created by the old consolidation process.
   */
  private static async cleanupConsolidatedFiles(
    memoryPath: string,
    indexName: string,
    vectorStore: LibSQLVector,
  ): Promise<void> {
    try {
      const memoryDir = path.posix.join(memoryPath, 'memory');
      const filesystem = new LocalFilesystem({ basePath: memoryPath });

      const memoryDirExists = await filesystem.exists(memoryDir);
      if (!memoryDirExists) {
        return;
      }

      // List files in /memory directory
      const memoryFiles = await filesystem.listFiles(memoryDir);
      const consolidatedFiles = memoryFiles.filter((f) => f.includes('/consolidated-'));

      if (consolidatedFiles.length === 0) {
        return;
      }

      forgeDebug('ltm', 'cleaning up consolidated files', { count: consolidatedFiles.length });

      // Delete each consolidated file
      for (const filePath of consolidatedFiles) {
        await filesystem.deleteFile(filePath);
        forgeDebug('ltm', 'deleted consolidated file', { filePath });
      }
    } catch (error) {
      forgeDebug('ltm', 'cleanup failed', { error: String(error) });
    }
  }

  async processInputStep(args: ProcessInputStepArgs<unknown>) {
    if (!args.messageList) {
      return args.messages;
    }

    const context = this.getThreadContext(args.requestContext, args.messageList);
    if (!context) {
      return args.messageList;
    }

    const queryText = this.buildRecallQuery(args.messages);
    args.messageList.clearSystemMessages(this.id);

    if (!queryText) {
      return args.messageList;
    }

    const workspaceContext = await this.searchWorkspace(queryText);
    const graphContext = await this.searchGraph(queryText);
    const sections = [
      workspaceContext ? `Workspace memory:\n${workspaceContext}` : '',
      graphContext ? `Graph memory:\n${graphContext}` : '',
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

    const context = this.getThreadContext(args.requestContext, args.messageList);
    if (!context) {
      return args.messages;
    }

    const currentRecord = await this.om.getRecord(context.threadId, context.resourceId);
    if (!currentRecord) {
      return args.messageList;
    }

    const hasObservationsDir =
      (await this.workspace.filesystem?.exists(this.observationsDir)) ?? false;
    const historyLimit = hasObservationsDir
      ? this.incrementalHistoryLimit
      : this.bootstrapHistoryLimit;
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
      const filePath = path.posix.join(this.observationsDir, `${observation.id}.md`);
      const content = [
        `# Observation`,
        '',
        `## observation:${observation.id}`,
        `Type: ${observation.originType}`,
        `CreatedAt: ${observation.createdAt.toISOString()}`,
        '',
        observation.activeObservations,
      ]
        .filter(Boolean)
        .join('\n');

      await this.workspace.filesystem?.writeFile(filePath, content, {
        recursive: true,
        overwrite: true,
      });
      await this.workspace.index(filePath, content, {
        metadata: {
          observationId: observation.id,
          indexName: this.searchIndexName,
        },
      });
    }

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
        .map((result) => {
          const score = typeof result.score === 'number' ? ` (score ${result.score.toFixed(2)})` : '';
          return `${result.id}${score}\n${String(result.content).trim()}`;
        })
        .join('\n\n---\n\n');
    } catch (error) {
      forgeDebug('ltm', 'workspace search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
  }

  private async searchGraph(queryText: string) {
    try {
      const results = await this.vectorStore.query({
        query: queryText,
        topK: 3,
        indexName: this.searchIndexName,
        includeVector: false,
      });

      if (results.length === 0) {
        return '';
      }

      const relevantContext = results
        .map((result) => {
          if (!result.text) {
            return '';
          }
          return result.text;
        })
        .filter(Boolean);

      if (relevantContext.length === 0) {
        return '';
      }

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
        return text ? `[${message.role}] ${text}` : '';
      })
      .filter(Boolean)
      .join('\n');
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
}
