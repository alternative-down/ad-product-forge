import {
  createAgentMemory,
  createCheckpointedObservationalMemoryProcessor,
  sanitizeWorkingMemory,
} from '@mastra-engine/core';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import type {
  InputProcessorOrWorkflow,
  OutputProcessorOrWorkflow,
} from '@mastra/core/processors';
import type { AgentConfig } from '@mastra/core/agent';
import type { LibSQLStore, LibSQLVector } from '@mastra/libsql';

export async function createAgentRuntimeMemory(input: {
  storage: LibSQLStore;
  vector: LibSQLVector;
  agentId: string;
  mastraId: string;
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
    });

    inputProcessors.push(checkpointedObservationalMemory);
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
