import {
  LongTermMemory,
  createAgentMemory,
  createObservationalMemory,
} from '@mastra-engine/core';
import { TokenLimiterProcessor } from '@mastra/core/processors';
import type {
  InputProcessorOrWorkflow,
  OutputProcessorOrWorkflow,
} from '@mastra/core/processors';
import type { AgentConfig } from '@mastra/core/agent';
import type { LibSQLStore, LibSQLVector } from '@mastra/libsql';

export function createAgentRuntimeMemory(input: {
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
  omObservationMessageTokens?: number;
  omObservationBufferTokens?: number;
  omObservationBufferActivation?: number;
  omObservationPreviousObserverTokens?: number;
  omReflectionObservationTokens?: number;
  omReflectionBufferActivation?: number;
}) {
  const memory = createAgentMemory({
    storage: input.storage,
    vector: input.vector,
    lastMessages: input.memoryLastMessagesFullEnabled ? undefined : input.memoryLastMessagesCount,
  });
  const omModel = input.omModel ?? input.agentModel;
  const observationalMemory = createObservationalMemory({
    storage: input.storage,
    model: omModel,
    observation: {
      messageTokens: input.omObservationMessageTokens,
      bufferTokens: input.omObservationBufferTokens,
      bufferActivation: input.omObservationBufferActivation,
      previousObserverTokens: input.omObservationPreviousObserverTokens,
    },
    reflection: {
      observationTokens: input.omReflectionObservationTokens,
      bufferActivation: input.omReflectionBufferActivation,
    },
  });
  const inputProcessors: InputProcessorOrWorkflow[] = [observationalMemory];
  const outputProcessors: OutputProcessorOrWorkflow[] = [observationalMemory];

  if (input.tokenCountFilterEnabled ?? true) {
    inputProcessors.unshift(new TokenLimiterProcessor(input.tokenCountFilterLimit ?? 100000));
  }

  if (input.longTermMemory) {
    const longTermMemory = new LongTermMemory({
      om: observationalMemory,
      agentId: input.agentId,
      mastraId: input.mastraId,
      memoryBasePath: input.agentMemoryPath,
      omModel,
    });
    inputProcessors.push(longTermMemory);
    outputProcessors.push(longTermMemory);
  }

  return {
    memory,
    inputProcessors,
    outputProcessors,
  };
}
