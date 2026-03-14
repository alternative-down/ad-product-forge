import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';
import { fastembed } from '@mastra/fastembed';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { ObservationalMemory } from '@mastra/memory/processors';

import {
  WORKING_MEMORY_TEMPLATE,
  appendWorkingMemoryInstructions,
} from './agent/working-memory';
import { OBSERVATIONAL_MEMORY_CONFIG } from './agent/observational-memory';
import { bindDefaultAgentRuntime } from './agent/runtime-defaults';

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
  const { omModel = config.model, id, ...agentConfig } = config;

  const dbUrl = `file:./${config.id}.db`;
  const storage = new LibSQLStore({ id: `${config.id}-storage`, url: dbUrl });
  const vector = new LibSQLVector({ id: `${config.id}-vector`, url: dbUrl });
  const om = new ObservationalMemory({
    storage: storage.stores.memory!,
    model: omModel,
    scope: 'thread',
    observation: OBSERVATIONAL_MEMORY_CONFIG.observation,
    reflection: OBSERVATIONAL_MEMORY_CONFIG.reflection,
  });

  const agent = new Agent<TAgentId, TTools, TOutput, TRequestContext>({
    id,
    ...agentConfig,
    instructions: appendWorkingMemoryInstructions(agentConfig.instructions),
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

  return bindDefaultAgentRuntime(agent, String(id));
}
