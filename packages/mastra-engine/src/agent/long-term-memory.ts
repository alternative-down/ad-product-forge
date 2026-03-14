import path from 'node:path';

import type { MastraDBMessage, MessageList } from '@mastra/core/agent';
import type {
  ProcessInputArgs,
  ProcessInputStepArgs,
  ProcessOutputStepArgs,
  Processor,
} from '@mastra/core/processors';
import type { Workspace } from '@mastra/core/workspace';
import { fastembed } from '@mastra/fastembed';
import { LibSQLVector } from '@mastra/libsql';
import { createGraphRAGTool } from '@mastra/rag';
import { ObservationalMemory } from '@mastra/memory/processors';

import { forgeDebug } from '../debug';
import { embedTextWithFastembed } from './embedder';

type ObservationRecord = Awaited<ReturnType<ObservationalMemory['getHistory']>>[number];

export type LongTermMemoryConfig = {
  om: ObservationalMemory;
  workspace: Workspace;
  vectorStore: LibSQLVector;
  graphIndexName: string;
};

export class LongTermMemory implements Processor<'long-term-memory'> {
  readonly id = 'long-term-memory';
  readonly name = 'Long Term Memory';
  private readonly observationsDir = 'observations';
  private readonly maxRecentRecallMessages = 8;
  private readonly bootstrapHistoryLimit = Number.MAX_SAFE_INTEGER;
  private readonly incrementalHistoryLimit = 12;

  constructor(private readonly config: LongTermMemoryConfig) {}

  static async ensureWorkspaceVectorIndex(vectorStore: LibSQLVector, indexName: string) {
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
      return args.messageList;
    }

    const currentRecord = await this.config.om.getRecord(context.threadId, context.resourceId);
    if (!currentRecord) {
      return args.messageList;
    }

    const hasObservationsDir =
      (await this.config.workspace.filesystem?.exists(this.observationsDir)) ?? false;
    const historyLimit = hasObservationsDir
      ? this.incrementalHistoryLimit
      : this.bootstrapHistoryLimit;
    const observations = await this.config.om.getHistory(
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

    const observationsByDay = new Map<string, ObservationRecord[]>();

    for (const observation of pendingObservations) {
      const day = observation.createdAt.toISOString().slice(0, 10);
      const bucket = observationsByDay.get(day) ?? [];
      bucket.push(observation);
      observationsByDay.set(day, bucket);
    }

    for (const [day, dayObservations] of observationsByDay.entries()) {
      const filePath = path.posix.join(this.observationsDir, `${day}.md`);
      const currentContent = await this.readFile(filePath);
      const header = currentContent.trim() || `# Observations for ${day}`;
      const additions = dayObservations
        .filter((observation) => !currentContent.includes(`## observation:${observation.id}`))
        .sort((left, right) => left.createdAt.getTime() - right.createdAt.getTime())
        .map((observation) =>
          [
            `## observation:${observation.id}`,
            `Type: ${observation.originType}`,
            `CreatedAt: ${observation.createdAt.toISOString()}`,
            '',
            observation.activeObservations.trim(),
          ].join('\n'),
        );

      if (additions.length === 0) {
        continue;
      }

      const nextContent = [header, ...additions].filter(Boolean).join('\n\n').trim();
      await this.config.workspace.filesystem?.writeFile(filePath, nextContent, {
        recursive: true,
        overwrite: true,
      });
      await this.config.workspace.index(filePath, nextContent, {
        metadata: {
          day,
          indexName: this.config.graphIndexName,
          observationCount: dayObservations.length,
        },
      });
    }

    return args.messageList;
  }

  private async readFile(filePath: string) {
    const exists = (await this.config.workspace.filesystem?.exists(filePath)) ?? false;

    if (!exists) {
      return '';
    }

    const content = await this.config.workspace.filesystem?.readFile(filePath);
    if (typeof content === 'string') {
      return content;
    }

    return content?.toString('utf8') ?? '';
  }

  private async searchWorkspace(queryText: string) {
    try {
      const results = await this.config.workspace.search(queryText, {
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
        vectorStore: this.config.vectorStore,
        indexName: this.config.graphIndexName,
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
