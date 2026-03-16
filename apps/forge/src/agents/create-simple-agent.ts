import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';

import type { CommunicationProvider } from '@mastra-engine/core';
import { createAgent, type CreateAgentConfig } from './create-forge-agent.js';

export type CreateSimpleAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & {
  omModel?: AgentConfig['model'];
  providers?: CommunicationProvider[];
  workspaceBasePath: string;
  workspaceAutoSync?: boolean;
  workspaceBm25?: boolean;
  workspaceEmbedder?: string;
  workspaceFilesystem?: Record<string, unknown>;
  workspaceSandbox?: Record<string, unknown>;
};

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
