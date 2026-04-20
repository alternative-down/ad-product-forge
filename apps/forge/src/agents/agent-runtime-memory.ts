import {
  createAgentMemory,
  createCheckpointedObservationalMemoryProcessor,
  type CheckpointedOmStateStore,
  type CheckpointedOmCheckpointPackageInput,
  sanitizeWorkingMemory,
  type WorkspaceEmbedderId,
} from '@mastra-engine/core';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import type {
  InputProcessorOrWorkflow,
  OutputProcessorOrWorkflow,
} from '@mastra/core/processors';
import type { AgentConfig } from '@mastra/core/agent';
import type { LibSQLStore, LibSQLVector } from '@mastra/libsql';

import { createAgentLongTermMemoryRecall } from './agent-long-term-memory-recall';

const FULL_MEMORY_LOAD_LAST_MESSAGES = Number.MAX_SAFE_INTEGER;

export async function createAgentRuntimeMemory(input: {
  storage: LibSQLStore;
  vector: LibSQLVector;
  agentId: string;
  mastraId: string;
  agentWorkspacePath: string;
  agentModel: AgentConfig['model'];
  omModel?: AgentConfig['model'];
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
  agentSystemPrompt?: string;
  onCheckpointAdvanced?: (input: CheckpointedOmCheckpointPackageInput) => Promise<void>;
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
  readRuntimeMemorySettings?: () => Promise<{
    checkpointedOmTotalContextTokens: number;
    checkpointedOmRecentRawTokens: number;
    checkpointedOmRawObservationBatchTokens: number;
    checkpointedOmObservationReflectionBatchTokens: number;
    checkpointedOmObservationSupportTokens: number;
    checkpointedOmReflectionSupportTokens: number;
    ltmRecallScoreThreshold: number;
    ltmRecallDocumentCount: number;
  }>;
}) {
  const checkpointedOmStateStore = input.checkpointedOmStateStore;

  const memory = createAgentMemory({
    storage: input.storage,
    vector: input.vector,
    embedder: input.workspaceEmbedder,
    lastMessages: input.memoryLastMessagesFullEnabled
      ? FULL_MEMORY_LOAD_LAST_MESSAGES
      : input.memoryLastMessagesCount,
  });
  await sanitizeWorkingMemory({
    memory,
    threadId: input.mastraId,
    resourceId: input.mastraId,
  });
  const inputProcessors: InputProcessorOrWorkflow[] = [];
  const outputProcessors: OutputProcessorOrWorkflow[] = [];
  const longTermMemoryRecall = input.longTermMemory
    ? createAgentLongTermMemoryRecall({
        agentId: input.agentId,
        agentWorkspacePath: input.agentWorkspacePath,
        agentMemoryPath: input.agentMemoryPath,
        workspaceEmbedder: input.workspaceEmbedder,
        mastraId: input.mastraId,
        storage: input.storage,
        scoreThreshold: input.ltmRecallScoreThreshold,
        documentCount: input.ltmRecallDocumentCount,
        checkpointedOmStateStore:
          checkpointedOmStateStore
          ?? (() => {
            throw new Error('LTM recall requires a checkpointed OM state store');
          })(),
        readRuntimeMemorySettings: input.readRuntimeMemorySettings,
      })
    : null;

  await longTermMemoryRecall?.initialize();

  if (input.checkpointedOmEnabled) {
    if (!checkpointedOmStateStore) {
      throw new Error('Checkpointed OM requires a checkpointed OM state store');
    }

    inputProcessors.push(createCheckpointedObservationalMemoryProcessor({
      storage: input.storage,
      model: input.omModel ?? input.agentModel,
      totalContextTokens: input.checkpointedOmTotalContextTokens,
      recentRawTokens: input.checkpointedOmRecentRawTokens,
      rawObservationBatchTokens: input.checkpointedOmRawObservationBatchTokens,
      observationReflectionBatchTokens:
        input.checkpointedOmObservationReflectionBatchTokens,
      observationSupportTokens: input.checkpointedOmObservationSupportTokens,
      reflectionSupportTokens: input.checkpointedOmReflectionSupportTokens,
      agentSystemPrompt: input.agentSystemPrompt,
      onCheckpointAdvanced: input.onCheckpointAdvanced,
      stateStore: checkpointedOmStateStore,
      getRuntimeConfig: input.readRuntimeMemorySettings
        ? async () => {
          const settings = await input.readRuntimeMemorySettings?.();

          if (!settings) {
            return {};
          }

          return {
            totalContextTokens: settings.checkpointedOmTotalContextTokens,
            recentRawTokens: settings.checkpointedOmRecentRawTokens,
            rawObservationBatchTokens: settings.checkpointedOmRawObservationBatchTokens,
            observationReflectionBatchTokens:
              settings.checkpointedOmObservationReflectionBatchTokens,
            observationSupportTokens: settings.checkpointedOmObservationSupportTokens,
            reflectionSupportTokens: settings.checkpointedOmReflectionSupportTokens,
          };
        }
        : undefined,
      }));
  }

  if (input.tokenCountFilterEnabled ?? true) {
    inputProcessors.push(new TokenLimiterProcessor(input.tokenCountFilterLimit ?? 100000));
  }

  return {
    memory,
    inputProcessors,
    outputProcessors,
    longTermMemoryRecall,
  };
}
