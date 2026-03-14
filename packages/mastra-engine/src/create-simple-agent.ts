import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';

import { createAgentMemory } from './agent/memory';
import { createObservationalMemory } from './agent/observational-memory';
import { createAgentStorage } from './agent/storage';
import { appendWorkingMemoryInstructions } from './agent/working-memory';

export type CreateSimpleAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & {
  omModel?: AgentConfig['model'];
};

export async function createSimpleAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: Pick<
    CreateSimpleAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
    'id' | 'name' | 'description' | 'instructions' | 'model' | 'tools' | 'workflows' | 'agents' | 'omModel'
  >,
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  const { storage, vector } = createAgentStorage(config.id);
  const memory = createAgentMemory({ storage, vector });
  const om = createObservationalMemory({
    storage,
    model: config.omModel ?? config.model,
  });

  return new Agent<TAgentId, TTools, TOutput, TRequestContext>({
    id: config.id,
    name: config.name,
    description: config.description,
    instructions: appendWorkingMemoryInstructions(config.instructions),
    model: config.model,
    tools: config.tools,
    workflows: config.workflows,
    agents: config.agents,
    memory,
    inputProcessors: [om],
    outputProcessors: [om],
  });
}
