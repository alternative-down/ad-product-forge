import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';

import { createCommunicationModule } from './agent/communication/module';
import type { CommunicationProvider } from './agent/communication/provider-types';
import { createExternalAccountTools } from './agent/communication/tools';
import { LongTermMemory } from './agent/memory/long-term-memory';
import { createAgentMemory } from './agent/memory/memory';
import { createObservationalMemory } from './agent/memory/observational-memory';
import { createAgentStorage } from './agent/memory/storage';
import { appendWorkingMemoryInstructions } from './agent/memory/working-memory';
import { createAgentWakeQueue } from './agent/wake-queue';

export type CreateForgeAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & {
  omModel?: AgentConfig['model'];
  providers?: CommunicationProvider[];
};

export async function createForgeAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: Pick<
    CreateForgeAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
    'id' | 'name' | 'description' | 'instructions' | 'model' | 'tools' | 'workflows' | 'workspace' | 'agents' | 'omModel' | 'providers'
  >,
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  const { storage, vector } = createAgentStorage(config.id);
  let wakeQueue: ReturnType<typeof createAgentWakeQueue> | null = null;
  const communication = createCommunicationModule({
    agentId: config.id,
    wakeUp() {
      if (!wakeQueue) {
        throw new Error(`Wake queue not ready for agent: ${config.id}`);
      }

      wakeQueue.notifyExternalEvent();
    },
  });
  const tools = {
    ...createExternalAccountTools(communication),
    ...(config.tools ?? {}),
  } as TTools;
  const memory = createAgentMemory({ storage, vector });
  const om = createObservationalMemory({
    storage,
    model: config.omModel ?? config.model,
  });
  const longTermMemory = await LongTermMemory.create({
    agentId: config.id,
    om,
  });
  const agent = new Agent<TAgentId, TTools, TOutput, TRequestContext>({
    id: config.id,
    name: config.name,
    description: config.description,
    instructions: appendWorkingMemoryInstructions(config.instructions),
    model: config.model,
    tools,
    workflows: config.workflows,
    workspace: config.workspace,
    agents: config.agents,
    memory,
    inputProcessors: [om, longTermMemory],
    outputProcessors: [om, longTermMemory],
  });
  wakeQueue = createAgentWakeQueue({
    run: () =>
      agent.generate('Pending external activity detected.\n\nCheck your messages, inspect what is pending, and process what matters.', {
        memory: {
          thread: config.id,
          resource: config.id,
        },
        maxSteps: 1000,
      }),
  });

  for (const provider of config.providers ?? []) {
    await communication.connectProvider(provider);
  }

  return agent;
}
