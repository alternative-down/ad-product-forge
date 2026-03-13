import path from 'node:path';

import type { MastraDBMessage, MessageList } from '@mastra/core/agent';
import { type ProcessInputArgs, type ProcessInputStepArgs, type ProcessOutputStepArgs, type Processor } from '@mastra/core/processors';
import type { Workspace } from '@mastra/core/workspace';
import { fastembed } from '@mastra/fastembed';
import { LibSQLVector } from '@mastra/libsql';
import { createGraphRAGTool } from '@mastra/rag';
import { ObservationalMemory } from '@mastra/memory/processors';

import { forgeDebug } from '../debug';

const MEMORY_OBSERVATIONS_DIR = 'observations';
const MAX_RECENT_RECALL_MESSAGES = 8;
const BOOTSTRAP_HISTORY_LIMIT = Number.MAX_SAFE_INTEGER;
const INCREMENTAL_HISTORY_LIMIT = 12;

async function embedTextWithFastembed(text: string): Promise<number[]> {
  const result = await fastembed.doEmbed({ values: [text] });
  return result.embeddings[0] ?? [];
}

export async function ensureWorkspaceVectorIndex(vectorStore: LibSQLVector, indexName: string) {
  try {
    await vectorStore.describeIndex({ indexName });
    return;
  } catch {
    const sampleEmbedding = await embedTextWithFastembed('forge-memory-bootstrap');
    await vectorStore.createIndex({
      indexName,
      dimension: sampleEmbedding.length,
      metric: 'cosine',
    });
  }
}

function isMissingWorkspaceIndexError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('SQLITE_ERROR: no such table') || message.includes('no such table:');
}

export type LongTermMemoryConfig = {
  om: ObservationalMemory;
  workspace: Workspace;
  vectorStore: LibSQLVector;
  graphIndexName: string;
};

type ObservationRecord = Awaited<ReturnType<ObservationalMemory['getHistory']>>[number];

export class LongTermMemory implements Processor<'long-term-memory'> {
  readonly id = 'long-term-memory';
  readonly name = 'Long Term Memory';

  constructor(private readonly config: LongTermMemoryConfig) {}

  async processInputStep(args: ProcessInputStepArgs<unknown>) {
    const { messageList, messages, requestContext } = args;
    if (!messageList) return messages;

    const context = this.getThreadContext(requestContext, messageList);
    if (!context) return messageList;

    const queryText = this.buildRecallQuery(messages);
    messageList.clearSystemMessages(this.id);
    forgeDebug('ltm', 'processInputStep', {
      hasContext: true,
      queryLength: queryText.length,
    });

    if (!queryText) {
      return messageList;
    }

    const [workspaceContext, graphContext] = await Promise.all([
      this.searchWorkspace(queryText),
      this.searchGraph(queryText),
    ]);

    const sections = [
      workspaceContext ? `Workspace memory:\n${workspaceContext}` : '',
      graphContext ? `Graph memory:\n${graphContext}` : '',
    ].filter(Boolean);

    if (sections.length === 0) {
      forgeDebug('ltm', 'no recall results');
      return messageList;
    }

    forgeDebug('ltm', 'recovered memory injected', {
      workspaceHit: Boolean(workspaceContext),
      graphHit: Boolean(graphContext),
    });

    messageList.addSystem(
      {
        role: 'system',
        content: [
          'Recovered past memory relevant to the current step. Use it as supporting recall, not as a replacement for the current conversation.',
          sections.join('\n\n'),
        ].join('\n\n'),
      },
      this.id,
    );

    return messageList;
  }

  async processOutputStep(args: ProcessOutputStepArgs<unknown>) {
    const { messageList, messages, requestContext } = args;
    if (!messageList) return messages;

    const context = this.getThreadContext(requestContext, messageList);
    if (!context) return messageList;

    const record = await this.config.om.getRecord(context.threadId, context.resourceId);
    if (!record) return messageList;

    const hasObservationDir =
      (await this.config.workspace.filesystem?.exists(MEMORY_OBSERVATIONS_DIR)) ?? false;

    const historyLimit = hasObservationDir ? INCREMENTAL_HISTORY_LIMIT : BOOTSTRAP_HISTORY_LIMIT;
    const observations = await this.config.om.getHistory(
      context.threadId,
      context.resourceId,
      historyLimit,
    );

    const pendingObservations = observations.filter((observation) => observation.id !== record.id);
    if (pendingObservations.length === 0) {
      forgeDebug('ltm', 'no pending observations');
      return messageList;
    }

    const observationsByDay = new Map<string, ObservationRecord[]>();
    for (const observation of pendingObservations) {
      const day = observation.createdAt.toISOString().slice(0, 10);
      const bucket = observationsByDay.get(day) ?? [];
      bucket.push(observation);
      observationsByDay.set(day, bucket);
    }

    const changedFiles = await Promise.all(
      Array.from(observationsByDay.entries()).map(async ([day, dayObservations]) => {
        const filePath = path.posix.join(MEMORY_OBSERVATIONS_DIR, `${day}.md`);
        const currentContent = await this.readFile(filePath);
        const nextContent = this.mergeObservationsIntoDailyFile(day, currentContent, dayObservations);

        if (nextContent === currentContent) {
          return null;
        }

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

        return filePath;
      }),
    );

    forgeDebug('ltm', 'observations materialized', {
      pendingObservationCount: pendingObservations.length,
      changedFiles: changedFiles.filter(Boolean).length,
    });

    return messageList;
  }

  private async readFile(filePath: string): Promise<string> {
    const exists = (await this.config.workspace.filesystem?.exists(filePath)) ?? false;
    if (!exists) return '';
    const content = await this.config.workspace.filesystem?.readFile(filePath);
    if (typeof content === 'string') return content;
    return content?.toString('utf8') ?? '';
  }

  private mergeObservationsIntoDailyFile(
    day: string,
    currentContent: string,
    observations: ObservationRecord[],
  ): string {
    const header = currentContent.trim() || `# Observations for ${day}`;
    const additions = observations
      .filter((observation) => !currentContent.includes(`## observation:${observation.id}`))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((observation) => [
        `## observation:${observation.id}`,
        `Type: ${observation.originType}`,
        `CreatedAt: ${observation.createdAt.toISOString()}`,
        '',
        observation.activeObservations.trim(),
      ].join('\n'));

    if (additions.length === 0) {
      return currentContent;
    }

    return [header, ...additions].filter(Boolean).join('\n\n').trim();
  }

  private async searchWorkspace(queryText: string): Promise<string> {
    try {
      const searchResults = await this.config.workspace.search(queryText, {
        topK: 3,
        mode: 'hybrid',
      });
      forgeDebug('ltm', 'workspace search completed', {
        resultCount: searchResults.length,
      });

      if (!searchResults.length) {
        return '';
      }

      return searchResults
        .map((result) => {
          const score = typeof result.score === 'number' ? ` (score ${result.score.toFixed(2)})` : '';
          return `${result.id}${score}\n${String(result.content).trim()}`;
        })
        .join('\n\n---\n\n');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isMissingWorkspaceIndexError(error)) {
        forgeDebug('ltm', 'workspace search skipped', { reason: message });
        return '';
      }

      forgeDebug('ltm', 'workspace search failed', { error: message });
      return '';
    }
  }

  private async searchGraph(queryText: string): Promise<string> {
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

  private buildRecallQuery(messages: MastraDBMessage[]): string {
    return messages
      .filter((message) => ['user', 'assistant', 'tool'].includes(message.role))
      .slice(-MAX_RECENT_RECALL_MESSAGES)
      .map((message) => {
        const text = this.extractMessageText(message).trim();
        return text ? `[${message.role}] ${text}` : '';
      })
      .filter(Boolean)
      .join('\n');
  }

  private extractMessageText(message: MastraDBMessage): string {
    if (typeof message.content === 'string') {
      return message.content;
    }

    if (Array.isArray(message.content)) {
      return message.content.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('\n');
    }

    const parts = Array.isArray(message.content?.parts) ? message.content.parts : [];
    return parts
      .map((part) => ('text' in part && typeof part.text === 'string' ? part.text : JSON.stringify(part)))
      .join('\n');
  }

  private getThreadContext(
    requestContext: ProcessInputArgs['requestContext'],
    messageList: MessageList,
  ): { threadId: string; resourceId?: string } | null {
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
