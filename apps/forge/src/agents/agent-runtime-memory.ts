import {
  LongTermMemory,
  createAgentMemory,
  createObservationalMemory,
} from '@mastra-engine/core';
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
}) {
  const memory = createAgentMemory({
    storage: input.storage,
    vector: input.vector,
  });
  const omModel = input.omModel ?? input.agentModel;
  const observationalMemory = createObservationalMemory({
    storage: input.storage,
    model: omModel,
  });
  const inputProcessors: InputProcessorOrWorkflow[] = [observationalMemory];
  const outputProcessors: OutputProcessorOrWorkflow[] = [observationalMemory];

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
