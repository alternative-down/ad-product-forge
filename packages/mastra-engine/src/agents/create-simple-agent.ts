import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';
import { fastembed } from '@mastra/fastembed';
import { LibSQLStore, LibSQLVector } from '@mastra/libsql';
import { Memory } from '@mastra/memory';
import { ObservationalMemory } from '@mastra/memory/processors';

const WORKING_MEMORY_INSTRUCTIONS = [
  'Working memory is your constitution.',
  'Use it only for stable, long-lived facts about yourself.',
  'Store only your identity, role, mission, principles, permanent constraints, and stable preferences explicitly defined for you.',
  'Do not store conversation history, recent requests, event summaries, users, channels, links, in-progress tasks, current context, logs, counts, or transient facts.',
  'If the information is about a user, an external event, a current task, or something likely to change soon, do not put it in working memory.',
  'Keep it short, dense, and stable.',
  'Use short bullets.',
].join('\n');

const WORKING_MEMORY_TEMPLATE = [
  'Identity',
  '-',
  'Role',
  '-',
  'Mission',
  '-',
  'Principles',
  '-',
  'Permanent constraints',
  '-',
  'Stable preferences',
  '-',
].join('\n');

export type CreateSimpleAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, any> | unknown = unknown,
> = AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & {
  omModel?: AgentConfig['model'];
};

export async function createSimpleAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, any> | unknown = unknown,
>(
  config: Pick<
    CreateSimpleAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
    'id' | 'name' | 'description' | 'instructions' | 'model' | 'tools' | 'workflows' | 'agents' | 'omModel'
  >,
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  const { omModel = config.model, id, ...agentConfig } = config;
  const omConfig = {
    observation: { messageTokens: 15000 },
    reflection: { observationTokens: 20000 },
  };
  const instructions =
    typeof agentConfig.instructions === 'string'
      ? `${agentConfig.instructions}\n\n${WORKING_MEMORY_INSTRUCTIONS}`
      : agentConfig.instructions;

  const dbUrl = `file:./${config.id}.db`;
  const storage = new LibSQLStore({ id: `${config.id}-storage`, url: dbUrl });
  const vector = new LibSQLVector({ id: `${config.id}-vector`, url: dbUrl });
  const om = new ObservationalMemory({
    storage: storage.stores.memory,
    model: omModel || config.model,
    scope: 'thread',
    observation: omConfig.observation,
    reflection: omConfig.reflection,
  });

  const agent = new Agent<TAgentId, TTools, TOutput, TRequestContext>({
    id,
    ...agentConfig,
    instructions,
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

  const defaultMemoryContext = {
    thread: String(id),
    resource: String(id),
  };
  const generate = agent.generate.bind(agent);
  agent.generate = ((...args: Parameters<typeof agent.generate>) => {
    const [messages, options] = args;

    return generate(messages, {
      ...(options ?? {}),
      memory: options?.memory ?? defaultMemoryContext,
      maxSteps: options?.maxSteps ?? 1000,
    });
  }) as typeof agent.generate;

  const stream = agent.stream.bind(agent);
  agent.stream = ((...args: Parameters<typeof agent.stream>) => {
    const [messages, options] = args;

    return stream(messages, {
      ...(options ?? {}),
      memory: options?.memory ?? defaultMemoryContext,
      maxSteps: options?.maxSteps ?? 1000,
    });
  }) as typeof agent.stream;

  return agent;
}
