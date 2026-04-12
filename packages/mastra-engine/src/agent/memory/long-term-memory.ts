import path from 'node:path';

import { Agent } from '@mastra/core/agent';
import type { AgentConfig } from '@mastra/core/agent';
import type { MastraDBMessage, MastraMessagePart, MessageList } from '@mastra/core/agent';
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
import { toMastraSafeIdentifier } from '../../mastra-id';
import { embedTextWithFastembed } from './embedder';


export type LongTermMemoryConfig = {
  om: ObservationalMemory;
  agentId: string;
  mastraId?: string;
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
  private readonly initTimeoutMs = 15_000;
  private readonly recallTimeoutMs = 20_000;
  private readonly memoryAgentTimeoutMs = 120_000;

  private readonly om: ObservationalMemory;
  private readonly workspace: WorkspaceRuntime;
  private readonly vectorStore: LibSQLVector;
  private readonly searchIndexName: string;
  private readonly omModel: AgentConfig['model'];
  private memoryAgent: Agent<string, never, string> | null = null;
  private memoryAgentRunning = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(config: LongTermMemoryConfig) {
    this.om = config.om;
    this.omModel = config.omModel;

    const memoryPath = config.memoryBasePath;
    const mastraAgentId = config.mastraId
      ? toMastraSafeIdentifier(config.mastraId)
      : toMastraSafeIdentifier(config.agentId);

    const vectorStorePath = `${path.dirname(memoryPath)}/${config.agentId}-memory.db`;
    this.vectorStore = new LibSQLVector({
      id: `${mastraAgentId}_memory_vector`,
      url: `file:${vectorStorePath}`,
    });

    this.searchIndexName = `${mastraAgentId}_memory_search`;

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
      id: toMastraSafeIdentifier(`${this.id}_agent`),
      name: 'Memory Consolidation Agent',
      instructions:
        'You are the unconscious memory-maintenance agent for another agent. Your job is to analyze raw observations, learn from them, and maintain a high-quality long-term memory base. You have access to three directories inside the workspace: memory (documents that will later be retrieved as long-term memory), observations (raw material to analyze), and archived (processed observation files). Always use workspace-relative paths without a leading slash. Start by listing observations and memory with list_files so you understand both the new information and the current memory structure. Read the observation files, understand what happened, extract facts, decisions, stable context, learned processes, technical learnings, product information, team context, and other durable knowledge that will help the agent later. Update memory documents so they stay coherent, rich, and useful for retrieval. Realign documents when newer information supersedes older information. Remove or rewrite statements that no longer make sense because a newer observation replaced them. Merge duplicated or fragmented information when it improves clarity. Keep the memory directory focused on useful long-term knowledge, not raw logs. Memory documents must be good retrieval documents: clear, information-dense, well named, and not excessively long. Prefer splitting broad topics into multiple focused documents over accumulating one oversized document. Archive processed observation files only after their relevant information has been incorporated into memory. IMPORTANT: Always check with list_files before reading, never attempt to read_file on a directory path, and check whether a file exists before writing with overwrite:false. Use overwrite:true when updating an existing memory file.',
      model: this.omModel,
      workspace: this.workspace,
    });
  }

  private async doInitialize() {
    if (!this.initializationPromise) {
      this.initializationPromise = (async () => {
        await withTimeout(
          this.workspace.init(),
          this.initTimeoutMs,
          'ltm workspace init timed out',
        );
        await withTimeout(
          this.createWorkspaceVectorIndexIfMissing(this.vectorStore, this.searchIndexName),
          this.initTimeoutMs,
          'ltm vector index initialization timed out',
        );
      })().catch((error) => {
        this.initializationPromise = null;
        throw error;
      });
    }

    await this.initializationPromise;
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

    const queryText = this.buildRecallQuery(args);

    if (!queryText) {
      return args.messageList;
    }

    const recallStartedAt = Date.now();
    const { formatted: workspaceResults, results: workspaceSearchResults } = await this.searchWorkspace(queryText);
    const graphContext = await this.searchGraph(queryText, workspaceSearchResults);
    forgeDebug('ltm', 'recall completed', {
      durationMs: Date.now() - recallStartedAt,
      queryLength: queryText.length,
      workspaceResultLength: workspaceResults.length,
      graphContextLength: graphContext.length,
    });
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
          'These are search results from your past memory. They may not reflect your current reality and must not be assumed as true by default. Treat them only as potentially relevant context that can be considered or mentioned when useful. If your more recent context conflicts with these results, prefer the more recent context. Treat this memory as extra information that may be outdated, incomplete, or incorrect.',
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

    const currentRecord = await withTimeout(
      this.om.getRecord(context.threadId, context.resourceId),
      this.recallTimeoutMs,
      'ltm observational memory record lookup timed out',
    );
    if (!currentRecord) {
      return args.messages;
    }

    const hasObservationsDir =
      (await this.workspace.filesystem?.exists(this.observationsDir)) ?? false;
    const historyLimit = hasObservationsDir ? this.incrementalHistoryLimit : this.bootstrapHistoryLimit;
    const observations = await withTimeout(
      this.om.getHistory(
        context.threadId,
        context.resourceId,
        historyLimit,
      ),
      this.recallTimeoutMs,
      'ltm observational memory history lookup timed out',
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

      await withTimeout(
        this.workspace.filesystem?.writeFile(filePath, content, {
          recursive: true,
          overwrite: true,
        }) ?? Promise.resolve(),
        this.recallTimeoutMs,
        `ltm observation write timed out for ${filePath}`,
      );
    }

    // Only call memory agent if this is the last step (no toolCalls + has text response)
    const hasToolCalls = args.toolCalls && args.toolCalls.length > 0;
    const hasTextResponse = args.text && args.text.trim().length > 0;
    const isLastStep = !hasToolCalls && hasTextResponse;

    if (isLastStep && !this.memoryAgentRunning && this.memoryAgent) {
      this.memoryAgentRunning = true;
      try {
        // Fire-and-forget: call memory agent to organize observations
        const controller = new AbortController();

        withTimeout(
          this.memoryAgent.generate('Review the observations and current memory documents. Learn from the new material, update or create focused memory documents, realign outdated information when newer information supersedes it, keep the memory rich but concise for future retrieval, avoid oversized memory files, and archive only the observation files that have truly been incorporated into memory. Use workspace-relative paths only.', {
            maxSteps: 1000,
            abortSignal: controller.signal,
          }),
          this.memoryAgentTimeoutMs,
          'ltm memory agent timed out',
          () => controller.abort(),
        )
          .catch((error: unknown) => {
            forgeDebug('ltm', 'memory agent call failed', { error: String(error) });
          })
          .finally(() => {
            this.memoryAgentRunning = false;
          });
      } catch (error) {
        this.memoryAgentRunning = false;
        forgeDebug('ltm', 'memory agent call failed', { error: String(error) });
      }
    }

    return args.messageList;
  }
  private async searchWorkspace(queryText: string): Promise<{ formatted: string; results: SearchResult[] }> {
    const startedAt = Date.now();
    try {
      const results = await withTimeout(
        this.workspace.search(queryText, {
          topK: 3,
          mode: 'hybrid',
        }),
        this.recallTimeoutMs,
        'ltm workspace search timed out',
      );

      forgeDebug('ltm', 'workspace search completed', {
        durationMs: Date.now() - startedAt,
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
      forgeDebug('ltm', 'workspace search failed', {
        durationMs: Date.now() - startedAt,
        error: message,
      });
      return { formatted: '', results: [] };
    }
  }

  private async searchGraph(queryText: string, workspaceResults: SearchResult[]) {
    const startedAt = Date.now();
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

      const graphResult = await withTimeout(
        graphTool.execute(
          {
            queryText: workspaceContext ? `${queryText}\nContext: ${workspaceContext}` : queryText,
            topK: 3,
          },
          {} as MastraToolInvocationOptions,
        ),
        this.recallTimeoutMs,
        'ltm graph search timed out',
      );

      const relevantContext = typeof graphResult?.relevantContext === 'string'
        ? graphResult.relevantContext
        : '';

      forgeDebug('ltm', 'graph search completed', {
        durationMs: Date.now() - startedAt,
        resultCount: relevantContext.length,
      });

      return relevantContext.trim();
    } catch (error) {
      forgeDebug('ltm', 'graph search failed', {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : String(error),
      });
      return '';
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
    const recentMessages = args.messages
      .filter((message) => message.role !== 'system')
      .slice(-this.maxRecentRecallMessages)
      .map((message) => this.extractMessageRecallText(message));

    const recentSteps = args.steps.slice(-this.maxRecentRecallMessages).map((step) =>
      [
        step.text,
        step.reasoningText ?? '',
        step.toolCalls.map((toolCall) => this.extractValueText(toolCall.input)).filter(Boolean).join(' '),
        step.toolResults.map((toolResult) => this.extractValueText(toolResult.output)).filter(Boolean).join(' '),
      ]
        .filter(Boolean)
        .join('\n'),
    );

    return [...recentMessages, ...recentSteps].filter(Boolean).join('\n');
  }

  private extractMessageContentText(message: MastraDBMessage) {
    if (typeof message.content.content === 'string' && message.content.content.trim()) {
      return message.content.content;
    }

    const parts = message.content.parts.flatMap((part) => {
      if (this.isTextMessagePart(part)) {
        return [part.text];
      }

      return [];
    });

    return parts.join('\n').trim();
  }

  private extractMessageRecallText(message: MastraDBMessage) {
    const sections = [
      this.extractMessageContentText(message),
      this.extractMessageReasoningText(message),
      this.extractMessageToolText(message),
    ].filter(Boolean);

    return sections.join('\n').trim();
  }

  private extractMessageReasoningText(message: MastraDBMessage) {
    const topLevelReasoning =
      typeof message.content.reasoning === 'string' ? message.content.reasoning.trim() : '';

    const partReasoning = message.content.parts
      .flatMap((part) => {
        if (!this.isReasoningMessagePart(part)) {
          return [];
        }

        const detailText = part.details
          .filter(
            (
              detail,
            ): detail is Extract<typeof part.details[number], { type: 'text'; text: string }> =>
              detail.type === 'text' &&
              typeof detail.text === 'string' &&
              detail.text.trim().length > 0,
          )
          .map((detail) => detail.text.trim())
          .join('\n')
          .trim();

        const reasoningText = part.reasoning.trim();

        return [reasoningText || detailText].filter(Boolean);
      })
      .join('\n')
      .trim();

    return [topLevelReasoning, partReasoning].filter(Boolean).join('\n').trim();
  }

  private extractMessageToolText(message: MastraDBMessage) {
    const partInvocations = message.content.parts
      .flatMap((part) => {
        if (!this.isToolInvocationMessagePart(part)) {
          return [];
        }

        const invocation = part.toolInvocation;
        const sections = [
          invocation.toolName,
          this.extractValueText('args' in invocation ? invocation.args : null),
          invocation.state === 'result' ? this.extractValueText(invocation.result) : '',
        ].filter(Boolean);

        return sections.length > 0 ? [sections.join('\n')] : [];
      })
      .join('\n')
      .trim();

    const topLevelInvocations = (message.content.toolInvocations ?? [])
      .flatMap((invocation) => {
        const sections = [
          invocation.toolName,
          this.extractValueText('args' in invocation ? invocation.args : null),
          invocation.state === 'result' ? this.extractValueText(invocation.result) : '',
        ].filter(Boolean);

        return sections.length > 0 ? [sections.join('\n')] : [];
      })
      .join('\n')
      .trim();

    return [partInvocations, topLevelInvocations].filter(Boolean).join('\n').trim();
  }

  private isTextMessagePart(part: MastraMessagePart): part is MastraMessagePart & { type: 'text'; text: string } {
    return part.type === 'text' && typeof part.text === 'string';
  }

  private isReasoningMessagePart(
    part: MastraMessagePart,
  ): part is Extract<MastraMessagePart, { type: 'reasoning'; reasoning: string; details: Array<{ type: string }> }> {
    return part.type === 'reasoning';
  }

  private isToolInvocationMessagePart(
    part: MastraMessagePart,
  ): part is Extract<MastraMessagePart, { type: 'tool-invocation' }> {
    return part.type === 'tool-invocation';
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

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
  onTimeout?: () => void,
) {
  let timeoutId: NodeJS.Timeout | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout?.();
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (!timeoutId) {
      return;
    }

    clearTimeout(timeoutId);
  });
}
