import type { Agent, AgentConfig, ToolsInput } from '@mastra/core/agent';
import type { AgentWakeEvent, CommunicationModule, CommunicationProvider } from '@mastra-engine/core';
import type { Workspace as WorkspaceRuntime } from '@mastra/core/workspace';

import type {
  WorkspaceFilesystemConfig,
  WorkspaceSandboxConfig,
  WorkspaceSkillsConfig,
} from '../database/schema';

export type CreateForgeAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = AgentConfig<TAgentId, TTools, TOutput, TRequestContext> & {
  omModel?: AgentConfig['model'];
  pricingModelKey: string;
  omPricingModelKey?: string;
  modelProfileId?: string;
  omModelProfileId?: string;
  companyName?: string;
  companyContext?: string;
  communicationDmFlushingEnabled?: boolean;
  communicationGroupFlushingEnabled?: boolean;
  memoryLastMessagesFullEnabled?: boolean;
  memoryLastMessagesCount?: number;
  tokenCountFilterEnabled?: boolean;
  tokenCountFilterLimit?: number;
  checkpointedOmEnabled?: boolean;
  checkpointedOmTotalContextTokens?: number;
  checkpointedOmRecentRawTokens?: number;
  checkpointedOmRawObservationBatchTokens?: number;
  checkpointedOmObservationReflectionBatchTokens?: number;
  checkpointedOmObservationSupportTokens?: number;
  checkpointedOmReflectionSupportTokens?: number;
  roleName?: string;
  roleDescription?: string;
  providers?: CommunicationProvider[];
  communication?: CommunicationModule;
  workspaceFilesystem?: WorkspaceFilesystemConfig;
  workspaceSandbox?: WorkspaceSandboxConfig;
  workspaceSkills?: WorkspaceSkillsConfig;
};

export type CreateAgentOptions = {
  longTermMemory?: boolean;
};

export type InternalAgentRuntime<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> = {
  id: TAgentId;
  mastraId: string;
  pricingModelKey: string;
  modelProfileId?: string;
  omPricingModelKey: string;
  omModelProfileId?: string;
  agent: Agent<TAgentId, TTools, TOutput, TRequestContext>;
  workspace: WorkspaceRuntime;
  communication: CommunicationModule;
  onReceiveMessage(handler: (event: AgentWakeEvent) => void): void;
  dispose(): Promise<void>;
};

export interface CreateAgentConfig<
  TAgentId extends string = string,
  TTools extends ToolsInput = ToolsInput,
  TOutput = undefined,
  TRequestContext extends Record<string, unknown> | unknown = unknown,
> extends Pick<
  CreateForgeAgentConfig<TAgentId, TTools, TOutput, TRequestContext>,
  | 'id'
  | 'name'
  | 'description'
  | 'instructions'
  | 'model'
  | 'pricingModelKey'
  | 'tools'
  | 'workflows'
  | 'agents'
  | 'omModel'
  | 'omPricingModelKey'
  | 'modelProfileId'
  | 'omModelProfileId'
  | 'companyName'
  | 'companyContext'
  | 'communicationDmFlushingEnabled'
  | 'communicationGroupFlushingEnabled'
  | 'memoryLastMessagesFullEnabled'
  | 'memoryLastMessagesCount'
  | 'tokenCountFilterEnabled'
  | 'tokenCountFilterLimit'
  | 'checkpointedOmEnabled'
  | 'checkpointedOmTotalContextTokens'
  | 'checkpointedOmRecentRawTokens'
  | 'checkpointedOmRawObservationBatchTokens'
  | 'checkpointedOmObservationReflectionBatchTokens'
  | 'checkpointedOmObservationSupportTokens'
  | 'checkpointedOmReflectionSupportTokens'
  | 'roleName'
  | 'roleDescription'
  | 'providers'
  | 'communication'
  | 'workspaceFilesystem'
  | 'workspaceSandbox'
  | 'workspaceSkills'
> {
  workspaceBasePath: string;
}
