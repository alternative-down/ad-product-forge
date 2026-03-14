import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';

import { createAgentMemory } from './agent/memory';
import { createMemoryWorkspace } from './agent/memory-workspace';
import { LongTermMemory } from './agent/long-term-memory';
import { createObservationalMemory } from './agent/observational-memory';
import { createAgentStorage } from './agent/storage';
import { appendWorkingMemoryInstructions } from './agent/working-memory';

export type CreateForgeAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & {
  omModel?: AgentConfig['model'];
};

export async function createForgeAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: Pick<
    CreateForgeAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
    'id' | 'name' | 'description' | 'instructions' | 'model' | 'tools' | 'workflows' | 'workspace' | 'agents' | 'omModel'
  >,
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  const { storage, vector } = createAgentStorage(config.id);
  const memory = createAgentMemory({ storage, vector });
  const om = createObservationalMemory({
    storage,
    model: config.omModel ?? config.model,
  });
  const memoryWorkspace = await createMemoryWorkspace(config.id);
  const longTermMemory = new LongTermMemory({
    om,
    workspace: memoryWorkspace.workspace,
    vectorStore: memoryWorkspace.vectorStore,
    graphIndexName: memoryWorkspace.indexName,
  });

  await LongTermMemory.ensureWorkspaceVectorIndex(
    memoryWorkspace.vectorStore,
    memoryWorkspace.indexName,
  );

  return new Agent<TAgentId, TTools, TOutput, TRequestContext>({
    id: config.id,
    name: config.name,
    description: config.description,
    instructions: appendWorkingMemoryInstructions(config.instructions),
    model: config.model,
    tools: config.tools,
    workflows: config.workflows,
    workspace: config.workspace,
    agents: config.agents,
    memory,
    inputProcessors: [om, longTermMemory],
    outputProcessors: [om, longTermMemory],
  });
}
