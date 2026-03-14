import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';

import { createCommunicationModule, type CommunicationProvider } from './agent/communication/module';
import { createExternalAccountTools } from './agent/communication/tools';
import { createAgentMemory } from './agent/memory/memory';
import { createObservationalMemory } from './agent/memory/observational-memory';
import { createAgentStorage } from './agent/memory/storage';
import { appendWorkingMemoryInstructions } from './agent/memory/working-memory';
import { createAgentWakeQueue } from './agent/wake-queue';

export type CreateSimpleAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & {
  omModel?: AgentConfig['model'];
  providers?: CommunicationProvider[];
};

export async function createSimpleAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: Pick<
    CreateSimpleAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
    'id' | 'name' | 'description' | 'instructions' | 'model' | 'tools' | 'workflows' | 'agents' | 'omModel' | 'providers'
  >,
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  const { storage, vector } = createAgentStorage(config.id);
  const communication = createCommunicationModule({ agentId: config.id });
  const tools = {
    ...createExternalAccountTools(communication),
    ...(config.tools ?? {}),
  } as TTools;
  const memory = createAgentMemory({ storage, vector });
  const om = createObservationalMemory({
    storage,
    model: config.omModel ?? config.model,
  });
  const agent = new Agent<TAgentId, TTools, TOutput, TRequestContext>({
    id: config.id,
    name: config.name,
    description: config.description,
    instructions: appendWorkingMemoryInstructions(config.instructions),
    model: config.model,
    tools,
    workflows: config.workflows,
    agents: config.agents,
    memory,
    inputProcessors: [om],
    outputProcessors: [om],
  });
  const wakeQueue = createAgentWakeQueue({ agent, agentId: config.id });

  communication.attachWakeQueue(wakeQueue);

  for (const provider of config.providers ?? []) {
    await communication.connectProvider(provider);
  }

  return agent;
}
