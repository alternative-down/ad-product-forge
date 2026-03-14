import type { Agent } from '@mastra/core/agent';

type AgentMemory = {
  thread: string;
  resource: string;
};

type AgentRunOptions = {
  memory?: AgentMemory;
  maxSteps?: number;
} & Record<string, unknown>;

export function bindDefaultAgentRuntime<TAgent extends Agent<any, any, any, any>>(agent: TAgent, agentId: string): TAgent {
  const defaultMemory: AgentMemory = {
    thread: agentId,
    resource: agentId,
  };

  const originalGenerate = agent.generate.bind(agent) as (
    messages: unknown,
    options?: AgentRunOptions,
  ) => ReturnType<TAgent['generate']>;
  agent.generate = ((
    messages: unknown,
    options?: AgentRunOptions,
  ) =>
    originalGenerate(messages, {
      ...(options ?? {}),
      memory: options?.memory ?? defaultMemory,
      maxSteps: options?.maxSteps ?? 1000,
    })) as TAgent['generate'];

  const originalStream = agent.stream.bind(agent) as (
    messages: unknown,
    options?: AgentRunOptions,
  ) => ReturnType<TAgent['stream']>;
  agent.stream = ((
    messages: unknown,
    options?: AgentRunOptions,
  ) =>
    originalStream(messages, {
      ...(options ?? {}),
      memory: options?.memory ?? defaultMemory,
      maxSteps: options?.maxSteps ?? 1000,
    })) as TAgent['stream'];

  return agent;
}
