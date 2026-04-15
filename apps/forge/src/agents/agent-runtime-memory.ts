import {
  createAgentMemory,
  createCheckpointedObservationalMemoryProcessor,
  type CheckpointedOmCheckpointPackageInput,
  sanitizeWorkingMemory,
} from '@mastra-engine/core';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import type {
  InputProcessorOrWorkflow,
  OutputProcessorOrWorkflow,
} from '@mastra/core/processors';
import type { AgentConfig } from '@mastra/core/agent';
import type { LibSQLStore, LibSQLVector } from '@mastra/libsql';

import { createAgentLongTermMemoryRecallProcessor } from './agent-long-term-memory-recall';

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
  agentSystemPrompt?: string;
  onCheckpointAdvanced?: (input: CheckpointedOmCheckpointPackageInput) => Promise<void>;
}) {
  const memory = createAgentMemory({
    storage: input.storage,
    vector: input.vector,
    lastMessages: input.memoryLastMessagesFullEnabled ? undefined : input.memoryLastMessagesCount,
  });
  await sanitizeWorkingMemory({
    memory,
    threadId: input.mastraId,
    resourceId: input.mastraId,
  });
  const inputProcessors: InputProcessorOrWorkflow[] = [];
  const outputProcessors: OutputProcessorOrWorkflow[] = [];

  if (input.checkpointedOmEnabled) {
    const checkpointedObservationalMemory = createCheckpointedObservationalMemoryProcessor({
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
    });

    inputProcessors.push(checkpointedObservationalMemory);
  }

  if (input.longTermMemory) {
    inputProcessors.push(
      createAgentLongTermMemoryRecallProcessor({
        agentId: input.agentId,
        agentWorkspacePath: input.agentWorkspacePath,
        mastraId: input.mastraId,
      }),
    );
  }

  if (input.tokenCountFilterEnabled ?? true) {
    inputProcessors.push(new TokenLimiterProcessor(input.tokenCountFilterLimit ?? 100000));
  }

  return {
    memory,
    inputProcessors,
    outputProcessors,
  };
}
