import path from 'node:path';

import { Agent } from '@mastra/core/agent';
import type { AgentConfig } from '@mastra/core/agent';
import type { MastraDBMessage, MessageList } from '@mastra/core/agent';
import type {
  ProcessInputArgs,
  ProcessInputStepArgs,
  ProcessOutputStepArgs,
  Processor,
} from '@mastra/core/processors';
import { LocalFilesystem, Workspace as WorkspaceRuntime } from '@mastra/core/workspace';
import { fastembed } from '@mastra/fastembed';
import { LibSQLVector } from '@mastra/libsql';
import { createGraphRAGTool } from '@mastra/rag';
import type { MastraToolInvocationOptions } from '@mastra/core/tools';
import { ObservationalMemory } from '@mastra/memory/processors';

import { forgeDebug } from '../../debug';
import { embedTextWithFastembed } from './embedder';


export type LongTermMemoryConfig = {
  om: ObservationalMemory;
  agentId: string;
  omModel: AgentConfig['model'];
  memoryBasePath: string;
};

export class LongTermMemory implements Processor<'long-term-memory'> {
  readonly id = 'long-term-memory';
  readonly name = 'Long Term Memory';
  private readonly memoryDir = 'memory';
  private readonly observationsDir = 'observations';
  private readonly archivedDir = 'archived';
  private readonly maxRecentRecallMessages = 8;
  private readonly bootstrapHistoryLimit = Number.MAX_SAFE_INTEGER;
  private readonly incrementalHistoryLimit = 6;

  private readonly om: ObservationalMemory;
  private readonly workspace: WorkspaceRuntime;
  private readonly vectorStore: LibSQLVector;
  private readonly searchIndexName: string;
  private readonly omModel: AgentConfig['model'];
  private memoryAgent: Agent<string, never, string> | null = null;
  private memoryAgentRunning = false;

  constructor(config: LongTermMemoryConfig) {
    this.om = config.om;
    this.omModel = config.omModel;

    const memoryPath = config.memoryBasePath;
    

    const vectorStorePath = `${path.dirname(memoryPath)}/${config.agentId}-memory.db`;
    this.vectorStore = new LibSQLVector({
      id: `${config.agentId}-memory-vector`,
      url: `file:${vectorStorePath}`,
    });

    this.searchIndexName = config.agentId + '_memory_search';

    this.workspace = new WorkspaceRuntime({
      autoSync: true,
      bm25: true,
      autoIndexPaths: ['/observations', '/memory'],
      embedder: embedTextWithFastembed,
      filesystem: new LocalFilesystem({ basePath: memoryPath }),
vectorStore: this.vectorStore,
      searchIndexName: this.searchIndexName,
    });

    // Create memory consolidation agent
    this.memoryAgent = new Agent({
      id: this.id + '-agent',
      name: 'Memory Consolidation Agent',
      instructions:
        'You are the unconscious of an LLM agent responsible for organizing, inferring, and registering memories from raw data. You have access to three directories: /memory (organized knowledge), /observations (raw observations), /archived (archived observations). Your task is to list the contents of /observations first using list_files, then read only the FILES (not directories), extract insights, learnings, processes, and key information, create organized files in /memory with meaningful names, and move processed files to /archived. IMPORTANT: Always check with list_files to see what exists before reading, and never attempt to read_file on a directory path (IsDirectoryError), and check if a file exists before writing with overwrite:false (FileExistsError). Use overwrite:true when updating existing files.',
      model: this.omModel,
      workspace: this.workspace,
    });
  }


  private async doInitialize() {
    await this.workspace.init();
    await this.createWorkspaceVectorIndexIfMissing(this.vectorStore, this.searchIndexName);
  }

  private async createWorkspaceVectorIndexIfMissing(vectorStore: LibSQLVector, indexName: string) {
    try {
      await vectorStore.describeIndex({ indexName });
    } catch {
      const sampleEmbedding = await embedTextWithFastembed('memory-bootstrap');
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

    await this.doInitialize();

    const context = this.getThreadContext(args.requestContext, args.messageList);
    if (!context) {
      return args.messageList;
    }

    const queryText = this.buildRecallQuery(args.messages);

    if (!queryText) {
      return args.messageList;
    }

    const { formatted: workspaceResults, results: workspaceSearchResults } = await this.searchWorkspace(queryText);
    const graphContext = await this.searchGraph(queryText, workspaceSearchResults);
    const sections = [
      workspaceResults ? 'Workspace memory:n' + workspaceResults : '',
      graphContext ? 'Graph memory:n' + graphContext : '',
    ].filter(Boolean);

    if (sections.length === 0) {
      return args.messageList;
    }

    args.messageList.addSystem(
      {
        role: 'system',
        content: [
          'Recovered past memory relevant to the current step. Use it as supporting recall, not as a replacement for the current conversation.',
          sections.join('\n'),
        ].join('\n'),
      },
      this.id,
    );

    return args.messageList;
  }

  async processOutputStep(args: ProcessOutputStepArgs<unknown>) {
    if (!args.messageList) {
      return args.messages;
    }

    await this.doInitialize();

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
    const historyLimit = hasObservationsDir ? this.incrementalHistoryLimit : this.bootstrapHistoryLimit;
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

    // Only call memory agent if this is the last step (no toolCalls + has text response)
    const hasToolCalls = args.toolCalls && args.toolCalls.length > 0;
    const hasTextResponse = args.text && args.text.trim().length > 0;
    const isLastStep = !hasToolCalls && hasTextResponse;

    if (isLastStep && !this.memoryAgentRunning && this.memoryAgent) {
      this.memoryAgentRunning = true;
      // Fire-and-forget: call memory agent to organize observations
      this.memoryAgent
        .generate('Review the /observations directory, organize insights into /memory, and archive processed files in /archived.', {
          maxSteps: 1000,
        })
        .then(() => this.memoryAgentRunning = false)
      .catch((error: unknown) => {
        forgeDebug('ltm', 'memory agent call failed', { error: String(error) });
      });
    }

    return args.messageList;
  }
  private async searchWorkspace(queryText: string): Promise<{ formatted: string; results: SearchResult[] }> {
    try {
      const results = await this.workspace.search(queryText, {
        topK: 3,
        mode: 'hybrid',
      });

      forgeDebug('ltm', 'workspace search completed', {
        resultCount: results.length,
      });

      const searchResults: SearchResult[] = results.map((r) => ({
        id: r.id,
        content: String(r.content).trim(),
        score: r.score,
      }));

      if (results.length === 0) {
        return { formatted: '', results: [] };
      }

      const formatted = results
        .map((result) => `${result.id}\n${String(result.content).trim()}`)
        .join('\n');

      return { formatted, results: searchResults };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes('SQLITE_ERROR: no such table') || message.includes('no such table:')) {
        return { formatted: '', results: [] };
      }
      forgeDebug('ltm', 'workspace search failed', { error: message });
      return { formatted: '', results: [] };
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
        .map((r) => r.content)
        .join('\n');

      const graphResult = await graphTool.execute(
        {
          queryText: workspaceContext ? `${queryText}\nContext: ${workspaceContext}` : queryText,
          topK: 3,
        },
        {} as MastraToolInvocationOptions,
      );

      const relevantContext = typeof graphResult?.relevantContext === 'string' 
        ? graphResult.relevantContext 
        : '';

      forgeDebug('ltm', 'graph search completed', {
        resultCount: relevantContext.length,
      });

      return relevantContext.trim();
    } catch (error) {
      forgeDebug('ltm', 'graph search failed', {
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
    }
  }

  private extractTextFromArgs(args: Record<string, unknown>): string {
    const textParts: string[] = [];
    for (const value of Object.values(args)) {
      if (typeof value === 'string') {
        textParts.push(value);
      } else if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') {
            textParts.push(item);
          } else if (typeof item === 'object' && item !== null) {
            textParts.push(this.extractTextFromArgs(item as Record<string, unknown>));
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        textParts.push(this.extractTextFromArgs(value as Record<string, unknown>));
      }
    }
    return textParts.filter(Boolean).join(' ');
  }

  private buildRecallQuery(messages: MastraDBMessage[]) {
    return messages
      .filter((message) => !['system'].includes(message.role))
      .slice(-this.maxRecentRecallMessages)
      .map(message => {
        const toolText = message.content.toolInvocations?.flatMap(
          tool => this.extractTextFromArgs(tool.args),
        ).filter(Boolean).join(' ') || '';
        return `
        ${message.content.content || ''}
        ${message.content.reasoning || ''}
        ${toolText}
        `.trim();
      }).filter(Boolean).join('\n');
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

  /**
   * Delete previously consolidated files from /memory directory.
   */}

type SearchResult = {
  id: string;
  content: string;
  score?: number;
};
