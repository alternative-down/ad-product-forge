import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';
import { fastembed } from '@mastra/fastembed';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { ObservationalMemory } from '@mastra/memory/processors';

import { OBSERVATIONAL_MEMORY_CONFIG } from './agent/observational-memory';
import { WORKING_MEMORY_TEMPLATE, appendWorkingMemoryInstructions } from './agent/working-memory';

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
  const dbUrl = `file:./${config.id}.db`;
  const storage = new LibSQLStore({ id: `${config.id}-storage`, url: dbUrl });
  const vector = new LibSQLVector({ id: `${config.id}-vector`, url: dbUrl });
  const om = new ObservationalMemory({
    storage: storage.stores.memory!,
    model: config.omModel ?? config.model,
    scope: 'thread',
    observation: OBSERVATIONAL_MEMORY_CONFIG.observation,
    reflection: OBSERVATIONAL_MEMORY_CONFIG.reflection,
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
    memory: new Memory({
      embedder: fastembed,
      storage,
      vector,
      options: {
        lastMessages: Number.MAX_SAFE_INTEGER,
        semanticRecall: false,
        observationalMemory: false,
        workingMemory: {
          enabled: true,
          scope: 'thread',
          template: WORKING_MEMORY_TEMPLATE,
        },
      },
    }),
    inputProcessors: [om],
    outputProcessors: [om],
  });
}
