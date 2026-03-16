import { Agent, type AgentConfig, type ToolsInput } from '@mastra/core/agent';

import type { CommunicationProvider } from '@mastra-engine/core';
import { createAgent } from './create-forge-agent.js';

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
  workspaceFilesystem?: Record<string, any>;
  workspaceSandbox?: Record<string, any>;
};

export async function createSimpleAgent<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
>(
  config: Pick<
    CreateSimpleAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
    | 'id'
    | 'name'
    | 'description'
    | 'instructions'
    | 'model'
    | 'tools'
    | 'workflows'
    | 'agents'
    | 'omModel'
    | 'providers'
    | 'workspaceBasePath'
    | 'workspaceAutoSync'
    | 'workspaceBm25'
    | 'workspaceEmbedder'
    | 'workspaceFilesystem'
    | 'workspaceSandbox'
  >,
): Promise<Agent<TAgentId, TTools, TOutput, TRequestContext>> {
  return createAgent(config as any, { longTermMemory: false });
}
