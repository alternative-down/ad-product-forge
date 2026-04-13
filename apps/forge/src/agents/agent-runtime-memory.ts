import {
  createAgentMemory,
  createObservationalMemory,
  LongTermMemory,
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
  const observationalMemoryConfig = {
    model: input.omModel ?? input.agentModel,
    observation: {
      messageTokens: input.omObservationMessageTokens,
      bufferTokens: false as const,
      previousObserverTokens: input.omObservationPreviousObserverTokens,
    },
    reflection: {
      observationTokens: input.omReflectionObservationTokens,
    },
  };
  const memory = createAgentMemory({
    storage: input.storage,
    vector: input.vector,
    lastMessages: input.memoryLastMessagesFullEnabled ? undefined : input.memoryLastMessagesCount,
    observationalMemory: observationalMemoryConfig,
  });
  const inputProcessors: InputProcessorOrWorkflow[] = [];
  const outputProcessors: OutputProcessorOrWorkflow[] = [];

  return initializeAgentRuntimeMemory({
    memory,
    inputProcessors,
    outputProcessors,
    input,
  });
}

async function initializeAgentRuntimeMemory(input: {
  memory: ReturnType<typeof createAgentMemory>;
  inputProcessors: InputProcessorOrWorkflow[];
  outputProcessors: OutputProcessorOrWorkflow[];
  input: {
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
  };
}) {
  const observationalMemory = await createObservationalMemory({
    memory: input.memory,
  });

  input.inputProcessors.push(observationalMemory.processor);
  input.outputProcessors.push(observationalMemory.processor);

  if (input.input.longTermMemory !== false) {
    const longTermMemory = new LongTermMemory({
      om: observationalMemory.engine,
      agentId: input.input.agentId,
      mastraId: input.input.mastraId,
      omModel: input.input.omModel ?? input.input.agentModel,
      memoryBasePath: input.input.agentMemoryPath,
    });

    input.inputProcessors.push(longTermMemory);
    input.outputProcessors.push(longTermMemory);
  }

  if (input.input.tokenCountFilterEnabled ?? true) {
    input.inputProcessors.push(new TokenLimiterProcessor(input.input.tokenCountFilterLimit ?? 100000));
  }

  return {
    memory: input.memory,
    inputProcessors: input.inputProcessors,
    outputProcessors: input.outputProcessors,
  };
}
