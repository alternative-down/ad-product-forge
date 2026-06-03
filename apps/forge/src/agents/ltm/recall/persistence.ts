import type {
  LongTermMemoryRecallHistory,
  LongTermMemoryRecallSnapshot,
  createAgentLongTermMemoryStore,
} from '../store';
import { readOperationalMemoryState } from '@forge-runtime/core';
import { buildLtmRecallSnapshot } from '../../agent-ltm-snapshot';
import type { LtmSnapshotDeps } from '../../agent-ltm-snapshot';
import type { ConversationStore } from '@forge-runtime/core';
import type { LtmSearchResult } from '../helpers';
import type { RecallConfig } from './types';
import { countFiles } from './count-files';

export interface RecallPersistenceDeps {
  persistenceStore: ReturnType<typeof createAgentLongTermMemoryStore>;
  conversationStore: ConversationStore;
  agentWorkspacePath: string;
  agentMemoryPath: string;
  lastInitAt: string | null;
}

export class RecallPersistence {
  private readonly persistenceStore: RecallPersistenceDeps['persistenceStore'];
  private readonly conversationStore: ConversationStore;
  private readonly agentWorkspacePath: string;
  private readonly agentMemoryPath: string;
  private lastInitAt: string | null;

  constructor(deps: RecallPersistenceDeps) {
    this.persistenceStore = deps.persistenceStore;
    this.conversationStore = deps.conversationStore;
    this.agentWorkspacePath = deps.agentWorkspacePath;
    this.agentMemoryPath = deps.agentMemoryPath;
    this.lastInitAt = deps.lastInitAt;
  }

  setLastInitAt(value: string | null): void {
    this.lastInitAt = value;
  }

  async readCurrentIndexStamp(): Promise<string | null> {
    return await this.persistenceStore.readRecallIndexStamp();
  }

  async getIndexStats(): Promise<{
    workspaceFileCount: number;
    memoryFileCount: number;
    checkpointFileCount: number;
  }> {
    const [workspaceFileCount, memoryFileCount, checkpointFileCount] = await Promise.all([
      countFiles(this.agentWorkspacePath, '.'),
      countFiles(this.agentMemoryPath, 'memory'),
      countFiles(this.agentMemoryPath, 'checkpoints'),
    ]);
    return { workspaceFileCount, memoryFileCount, checkpointFileCount };
  }

  async persistRecallSnapshot(
    threadContext: { threadId: string | null; resourceId?: string },
    snapshot: LongTermMemoryRecallSnapshot,
    history?: LongTermMemoryRecallHistory,
  ): Promise<void> {
    await this.persistenceStore.writeRecallState({
      threadId: threadContext.threadId,
      resourceId: threadContext.resourceId,
      snapshot,
      history,
    });
  }

  async persistRecallSnapshotWithInput(
    input: { step: unknown; steps: unknown[]; threadId: string | null; resourceId?: string },
    deps: {
      queryText?: string;
      recallConfig?: LtmSnapshotDeps['recallConfig'];
      indexStats?: LtmSnapshotDeps['indexStats'];
      dedupedGraph?: LtmSnapshotDeps['dedupedGraph'];
      filteredResults?: LtmSnapshotDeps['filteredResults'];
      history?: LongTermMemoryRecallHistory;
      status: 'miss' | 'hit' | 'error';
      error?: string;
    },
  ): Promise<void> {
    const threadContext = { threadId: input.threadId, resourceId: input.resourceId };
    const snapshot = buildLtmRecallSnapshot(
      {
        lastInitAt: this.lastInitAt,
        steps: input.steps,
        queryText: deps.queryText,
        recallConfig: deps.recallConfig,
        indexStats: deps.indexStats,
        dedupedGraph: deps.dedupedGraph,
        filteredResults: deps.filteredResults,
      },
      threadContext,
      { status: deps.status, error: deps.error },
    );
    await this.persistRecallSnapshot(threadContext, snapshot, deps.history);
  }

  async persistMissRecall(
    threadContext: { threadId: string | null; resourceId?: string },
    input: { steps: unknown[]; step: unknown },
    recentFingerprints: string[],
  ): Promise<void> {
    await this.persistRecallSnapshotWithInput(
      { threadId: threadContext.threadId, resourceId: threadContext.resourceId, step: input.step, steps: input.steps },
      {
        history: {
          recentFingerprints,
          updatedAt: String(Date.now()),
        },
        status: 'miss',
      },
    );
  }

  async persistHitRecall(
    threadContext: { threadId: string | null; resourceId?: string },
    input: { steps: unknown[]; step: unknown },
    payload: {
      queryText: string;
      recallConfig: RecallConfig;
      indexStats: { workspaceFileCount: number; memoryFileCount: number; checkpointFileCount: number };
      dedupedGraph: { hit: boolean; score?: number; context: string };
      filteredResults: LtmSearchResult[];
      history: LongTermMemoryRecallHistory;
    },
  ): Promise<void> {
    await this.persistRecallSnapshotWithInput(
      { threadId: threadContext.threadId, resourceId: threadContext.resourceId, step: input.step, steps: input.steps },
      {
        queryText: payload.queryText,
        recallConfig: payload.recallConfig,
        indexStats: payload.indexStats,
        dedupedGraph: payload.dedupedGraph,
        filteredResults: payload.filteredResults,
        history: payload.history,
        status: 'hit',
      },
    );
  }

    async readRecallThreadState(
    threadId: string | null,
    recentRawTokens: number,
  ): Promise<{
    recentFingerprints: string[];
    windowSize: number;
    rawWindowMessageCount: number;
  }> {
    const persistedState = await this.persistenceStore.readRecallState();
    const recentFingerprints = Array.isArray(persistedState.history?.recentFingerprints)
      ? persistedState.history.recentFingerprints.filter(
          (value: unknown): value is string => typeof value === 'string' && value.length > 0,
        )
      : [];
    const operationalMemoryState: any =
      (threadId ?? '') !== ''
        ? await readOperationalMemoryState({
            threadId: threadId as string,
            store: this.conversationStore,
            recentTokenLimit: recentRawTokens,
          })
        : null;
    const rawWindowMessageCount =
      operationalMemoryState !== null && operationalMemoryState !== undefined
        ? (operationalMemoryState.metrics?.rawMessageCount ?? 0)
        : 0;
    const windowSize =
      rawWindowMessageCount > 0 ? Math.max(1, Math.floor(rawWindowMessageCount * 0.25)) : 20;
    return {
      recentFingerprints,
      windowSize,
      rawWindowMessageCount,
    };
  }
}

export function createRecallPersistence(deps: RecallPersistenceDeps): RecallPersistence {
  return new RecallPersistence(deps);
}
