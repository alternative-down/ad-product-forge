import {
  type CheckpointedOmStateStore,
  type WorkspaceEmbedderId,
} from '@forge-runtime/core';

import type { createAgentLongTermMemoryStore } from './agent-long-term-memory-store';
import { createAgentLongTermMemoryRecall } from './agent-long-term-memory-recall';

export async function createAgentRuntimeMemory(input: {
  agentId: string;
  mastraId: string;
  agentWorkspacePath: string;
  agentModel: unknown;
  omModel?: unknown;
  agentMemoryPath: string;
  longTermMemory?: boolean;
  memoryLastMessagesFullEnabled?: boolean;
  memoryLastMessagesCount?: number;
  tokenCountFilterEnabled?: boolean;
  tokenCountFilterLimit?: number;
  checkpointedOmEnabled?: boolean;
  checkpointedOmTotalContextTokens?: number;
  checkpointedOmRecentRawTokens?: number;
  checkpointedOmRawObservationBatchTokens?: number;
  checkpointedOmObservationReflectionBatchTokens?: number;
  checkpointedOmObservationSupportTokens?: number;
  checkpointedOmReflectionSupportTokens?: number;
  ltmRecallScoreThreshold?: number;
  ltmRecallDocumentCount?: number;
  workspaceEmbedder?: WorkspaceEmbedderId;
  checkpointedOmStateStore?: CheckpointedOmStateStore & {
    readState(): Promise<{
      checkpointGeneration: number | null;
      checkpointSummary: {
        text: string;
        tokenCount: number;
        upToGeneration: number;
        updatedAt: string;
      } | null;
      observationBlocks: Array<{
        id: string;
        text: string;
        tokenCount: number;
        createdAt: string;
        lastObservedAt: string;
        reflectedGeneration: number | null;
      }>;
      latestMetrics: {
        recentRawMessageCount?: number;
      } | null;
    }>;
  };
  persistenceStore: ReturnType<typeof createAgentLongTermMemoryStore>;
  readRuntimeMemorySettings?: () => Promise<{
    ltmRecallGraphTopK: number;
    ltmRecallGraphThreshold: number;
    ltmRecallGraphRandomWalkSteps: number;
    ltmRecallGraphIncludeSources: boolean;
    ltmRecallScoreThreshold: number;
    ltmRecallDocumentCount: number;
  }>;
}) {
  const checkpointedOmStateStore = input.checkpointedOmStateStore;
  const longTermMemoryRecall = input.longTermMemory
    ? createAgentLongTermMemoryRecall({
        agentId: input.agentId,
        agentWorkspacePath: input.agentWorkspacePath,
        agentMemoryPath: input.agentMemoryPath,
        workspaceEmbedder: input.workspaceEmbedder,
        mastraId: input.mastraId,
        scoreThreshold: input.ltmRecallScoreThreshold,
        documentCount: input.ltmRecallDocumentCount,
        checkpointedOmStateStore:
          checkpointedOmStateStore
          ?? (() => {
            throw new Error('LTM recall requires a checkpointed OM state store');
          })(),
        persistenceStore: input.persistenceStore,
        readRuntimeMemorySettings: input.readRuntimeMemorySettings,
      })
    : null;

  await longTermMemoryRecall?.initialize();

  return {
    longTermMemoryRecall,
  };
}
