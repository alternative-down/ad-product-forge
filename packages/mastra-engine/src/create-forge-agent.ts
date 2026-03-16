import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';
import type { InputProcessorOrWorkflow, OutputProcessorOrWorkflow } from '@mastra/core/processors';
import { createClient } from '@libsql/client';
import path from 'node:path';

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

export type CreateAgentOptions = {
  longTermMemory?: boolean;
};

export async function createAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: Pick<
    CreateForgeAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
    'id' | 'name' | 'description' | 'instructions' | 'model' | 'tools' | 'workflows' | 'agents' | 'omModel' | 'providers'
  > & {
    workspace?: Exclude<CreateForgeAgentConfig['workspace'], Function>;
  },
  options: CreateAgentOptions = {},
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  const { client, storage, vector } = createAgentStorage(config.id);

  // Create communication database client from workspace path (default to cwd if not provided)
  const workspacePath = (config.workspace?.filesystem as any)?._basePath || process.cwd();
  const communicationDbPath = path.resolve(workspacePath, 'communications.db');
  const communicationClient = createClient({ url: `file:${communicationDbPath}` });

  const communication = await createCommunicationModule({
    client: communicationClient,
    providers: config.providers ?? [],
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

  const inputProcessors: InputProcessorOrWorkflow[] = [om];
  const outputProcessors: OutputProcessorOrWorkflow[] = [om];

  if (options.longTermMemory) {
    const longTermMemory = await LongTermMemory.create({
      agentId: config.id,
      om,
    });
    inputProcessors.push(longTermMemory);
    outputProcessors.push(longTermMemory);
  }

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
    inputProcessors,
    outputProcessors,
  });
  const wakeQueue = createAgentWakeQueue({
    run: () =>
      agent.generate('Pending external activity detected.\n\nCheck your messages, inspect what is pending, and process what matters.', {
        memory: {
          thread: config.id,
          resource: config.id,
        },
        maxSteps: 1000,
      }),
  });
  communication.onReceiveMessage(wakeQueue.notifyExternalEvent);

  return agent;
}

export async function createForgeAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: Pick<
    CreateForgeAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
    'id' | 'name' | 'description' | 'instructions' | 'model' | 'tools' | 'workflows' | 'agents' | 'omModel' | 'providers'
  > & {
    workspace?: Exclude<CreateForgeAgentConfig['workspace'], Function>;
  },
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  return createAgent(config, { longTermMemory: true });
}
