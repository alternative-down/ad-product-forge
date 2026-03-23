import path from 'node:path';

import type { MastraDBMessage, MessageList } from '@mastra/core/agent';
import type {
  ProcessInputArgs,
  ProcessInputStepArgs,
  ProcessOutputStepArgs,
  Processor,
} from '@mastra/core/processors';
import type { Workspace } from '@mastra/core/workspace';
import { LocalFilesystem, LocalSandbox, Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import { fastembed } from '@mastra/fastembed';
import { LibSQLVector } from '@mastra/libsql';
import { createGraphRAGTool } from '@mastra/rag';
import { ObservationalMemory } from '@mastra/memory/processors';

import { forgeDebug } from '../../debug';
import { embedTextWithFastembed } from './embedder';

type ObservationRecord = Awaited<ReturnType<ObservationalMemory['getHistory']>>[number];
const MEMORY_WORKSPACE_ROOT = '.forge-memory';

export type LongTermMemoryConfig = {
  om: ObservationalMemory;
  workspace: Workspace;
  vectorStore: LibSQLVector;
  searchIndexName: string;
  consolidationTrigger?: 'lastStep' | 'onIdle';
  consolidationInstructions?: string;
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
  private readonly consolidationTrigger: 'lastStep' | 'onIdle';
  private readonly consolidationInstructions: string;

  constructor(config: LongTermMemoryConfig) {
    this.om = config.om;
    this.workspace = config.workspace;
    this.vectorStore = config.vectorStore;
    this.searchIndexName = config.searchIndexName;
    this.consolidationTrigger = config.consolidationTrigger || 'lastStep';
    this.consolidationInstructions =
      config.consolidationInstructions ||
      'Consolidate observations into organized knowledge. Extract insights, learnings, processes, and key information from /observations. Create organized files in /memory with meaningful names. Move processed observations to /archived.';
  }

  static async create(config: {
    agentId: string;
    om: ObservationalMemory;
    memoryBasePath?: string;
    consolidationTrigger?: 'lastStep' | 'onIdle';
    consolidationInstructions?: string;
  }) {
    const indexName = `${config.agentId}_memory_search`.replace(/[^a-zA-Z0-9_]/g, '_');
    const memoryPath = config.memoryBasePath || path.resolve(process.cwd(), MEMORY_WORKSPACE_ROOT, config.agentId);
    const vectorStorePath = path.resolve(path.dirname(memoryPath), `${config.agentId}-memory-workspace.db`);

    const vectorStore = new LibSQLVector({
      id: `${config.agentId}-memory-workspace-vector`,
      url: `file:${vectorStorePath}`,
    });
    const workspace = new WorkspaceRuntime({
      bm25: true,
      autoSync: true,
      autoIndexPaths: ['/observations', '/memory', '/archived'],
      embedder: embedTextWithFastembed,
      filesystem: new LocalFilesystem({
        basePath: memoryPath,
      }),
      sandbox: new LocalSandbox({
        isolation: 'none',
        workingDirectory: memoryPath,
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
      consolidationTrigger: config.consolidationTrigger,
      consolidationInstructions: config.consolidationInstructions,
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
      return args.messages;
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

    // Check if this is the last step (no toolCalls + has text response)
    // This triggers consolidation when the agent completes a run
    if (this.consolidationTrigger === 'lastStep') {
      const hasToolCalls = args.messages.some(
        (msg) =>
          msg.role === 'assistant' &&
          Array.isArray(msg.content) &&
          msg.content.some((c) => 'type' in c && c.type === 'tool-use'),
      );
      // Check for text content - look for string messages from assistant
      const hasTextResponse = args.messages.some((msg) => {
        if (msg.role !== 'assistant') return false;
        const content = msg.content as unknown as string | undefined;
        return typeof content === 'string' && content.trim().length > 0;
      });

      const isLastStep = !hasToolCalls && hasTextResponse;

      if (isLastStep) {
        // Fire-and-forget consolidation
        this.runConsolidation(pendingObservations, currentRecord.id).catch((error: unknown) => {
          forgeDebug('ltm', 'consolidation failed', { error: String(error) });
        });
      }
    }

    return args.messageList;
  }

  private async runConsolidation(
    observations: ObservationRecord[],
    latestObservationId: string,
  ): Promise<void> {
    try {
      if (observations.length === 0) {
        return;
      }

      // Create consolidated knowledge file in /memory
      const today = new Date().toISOString().split('T')[0];
      const consolidatedFileName = `consolidated-${today}.md`;
      const consolidatedPath = path.posix.join(this.memoryDir, consolidatedFileName);

      const consolidatedContent = [
        `# Consolidated Memory - ${today}`,
        '',
        `Generated from ${observations.length} observation(s).`,
        '',
        ...observations.map((obs) => [
          `## observation:${obs.id}`,
          `Type: ${obs.originType}`,
          `CreatedAt: ${obs.createdAt.toISOString()}`,
          '',
          obs.activeObservations,
        ].join('\n')),
      ].join('\n\n');

      await this.workspace.filesystem?.writeFile(consolidatedPath, consolidatedContent, {
        recursive: true,
        overwrite: true,
      });

      // Index the consolidated file
      await this.workspace.index(consolidatedPath, consolidatedContent, {
        metadata: {
          type: 'consolidated',
          indexName: this.searchIndexName,
        },
      });

      // Move the latest observation to /archived
      const observationFilePath = path.posix.join(this.observationsDir, `${latestObservationId}.md`);
      const archivedFilePath = path.posix.join(this.archivedDir, `${latestObservationId}.md`);

      const obsExists = (await this.workspace.filesystem?.exists(observationFilePath)) ?? false;
      if (obsExists) {
        const obsContent = await this.workspace.filesystem?.readFile(observationFilePath);
        if (obsContent && typeof obsContent === 'string') {
          await this.workspace.filesystem?.writeFile(archivedFilePath, obsContent, {
            recursive: true,
            overwrite: true,
          });
          forgeDebug('ltm', 'observation archived', { observationId: latestObservationId });
        }
      }

      forgeDebug('ltm', 'consolidation completed', {
        observationCount: observations.length,
        consolidatedFile: consolidatedFileName,
      });
    } catch (error) {
      forgeDebug('ltm', 'consolidation error', { error: String(error) });
    }
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
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('SQLITE_ERROR: no such table') || message.includes('no such table:')) {
        return '';
      }

      forgeDebug('ltm', 'workspace search failed', { error: message });
      return '';
    }
  }

  private async searchGraph(queryText: string) {
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
      const result = await graphTool.execute({ queryText, topK: 3 }, {} as never);
      const relevantContext = Array.isArray(result?.relevantContext) ? result.relevantContext : [];

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
