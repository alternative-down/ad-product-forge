import type { Agent } from '@mastra/core/agent';

export const OBSERVATIONAL_MEMORY_CONFIG = {
  observation: { messageTokens: 15000 },
  reflection: { observationTokens: 20000 },
} as const;

export const WORKING_MEMORY_INSTRUCTIONS = [
  'Working memory is your constitution.',
  'Use it only for stable, long-lived facts about yourself.',
  'Store only your identity, role, mission, principles, permanent constraints, and stable preferences explicitly defined for you.',
  'Do not store conversation history, recent requests, event summaries, users, channels, links, in-progress tasks, current context, logs, counts, or transient facts.',
  'If the information is about a user, an external event, a current task, or something likely to change soon, do not put it in working memory.',
  'Keep it short, dense, and stable.',
  'Use short bullets.',
].join('\n');

export const WORKING_MEMORY_TEMPLATE = [
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

export function appendWorkingMemoryInstructions(instructions: string): string;
export function appendWorkingMemoryInstructions<T>(instructions: T): T;
export function appendWorkingMemoryInstructions(instructions: unknown) {
  if (typeof instructions !== 'string') {
    return instructions;
  }

  return `${instructions}\n\n${WORKING_MEMORY_INSTRUCTIONS}`;
}

export function bindDefaultAgentRuntime<TAgent extends Agent<any, any, any, any>>(agent: TAgent, agentId: string): TAgent {
  const defaultMemory = {
    thread: agentId,
    resource: agentId,
  };
  type AgentRunOptions = {
    memory?: typeof defaultMemory;
    maxSteps?: number;
  } & Record<string, unknown>;

  const generate = agent.generate.bind(agent) as any;
  agent.generate = ((messages: unknown, options?: AgentRunOptions) =>
    generate(messages, {
      ...(options ?? {}),
      memory: options?.memory || defaultMemory,
      maxSteps: options?.maxSteps || 1000,
    })) as typeof agent.generate;

  const stream = agent.stream.bind(agent) as any;
  agent.stream = ((messages: unknown, options?: AgentRunOptions) =>
    stream(messages, {
      ...(options ?? {}),
      memory: options?.memory || defaultMemory,
      maxSteps: options?.maxSteps || 1000,
    })) as typeof agent.stream;

  return agent;
}
