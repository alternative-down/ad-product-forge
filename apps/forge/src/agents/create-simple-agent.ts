import { Agent, type ToolsInput } from '@mastra/core/agent';
import { createAgent, type CreateAgentConfig } from './create-forge-agent';

export async function createSimpleAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: CreateAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  return createAgent(config, { longTermMemory: false });
}
