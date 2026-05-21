import type { AgentRuntimeData } from './agent-loader-data';
import type { AgentToolset } from './agent-loader-tools';
import type { CreateAgentConfig } from './runtime/types';
import type { WorkspaceFilesystemConfig, WorkspaceSandboxConfig, WorkspaceSkillsConfig } from '../database/schema';
import type { WorkspaceEmbedderId } from '@forge-runtime/core';
import type { AgentLoaderConfig } from './agent-loader-types';


export function buildAgentRuntimeConfig(
  loaderConfig: AgentLoaderConfig,
  runtimeData: AgentRuntimeData,
  toolset: AgentToolset,
): CreateAgentConfig {
  return {
    id: runtimeData.agent.id,
    name: runtimeData.agent.name,
    description: runtimeData.agent.description ?? undefined,
    instructions: runtimeData.agent.instructions,
    model: runtimeData.primaryRuntimeModel,
    pricingModelKey: runtimeData.primaryProfile.modelKey,
    modelProfileId: runtimeData.primaryProfile.profileId,
    omModel: runtimeData.omRuntimeModel,
    omPricingModelKey: runtimeData.omProfile.modelKey,
    omModelProfileId: runtimeData.omProfile.profileId,
    companyName: runtimeData.companySettings.companyName,
    companyContext: runtimeData.companySettings.companyContext,
    communicationDmFlushingEnabled: runtimeData.companySettings.communicationDmFlushingEnabled,
    communicationGroupFlushingEnabled: runtimeData.companySettings.communicationGroupFlushingEnabled,
    memoryLastMessagesFullEnabled: runtimeData.companySettings.memoryLastMessagesFullEnabled,
    memoryLastMessagesCount: runtimeData.companySettings.memoryLastMessagesCount,
    tokenCountFilterEnabled: runtimeData.companySettings.tokenCountFilterEnabled,
    tokenCountFilterLimit: runtimeData.companySettings.tokenCountFilterLimit,
    checkpointedOmEnabled: runtimeData.companySettings.checkpointedOmEnabled,
    checkpointedOmTotalContextTokens: runtimeData.companySettings.checkpointedOmTotalContextTokens,
    checkpointedOmRecentRawTokens: runtimeData.companySettings.checkpointedOmRecentRawTokens,
    checkpointedOmRawObservationBatchTokens:
      runtimeData.companySettings.checkpointedOmRawObservationBatchTokens,
    checkpointedOmObservationReflectionBatchTokens:
      runtimeData.companySettings.checkpointedOmObservationReflectionBatchTokens,
    checkpointedOmObservationSupportTokens:
      runtimeData.companySettings.checkpointedOmObservationSupportTokens,
    checkpointedOmReflectionSupportTokens:
      runtimeData.companySettings.checkpointedOmReflectionSupportTokens,
    ltmRecallScoreThreshold: runtimeData.companySettings.ltmRecallScoreThreshold,
    ltmRecallDocumentCount: runtimeData.companySettings.ltmRecallDocumentCount,
    roleName: runtimeData.role?.name,
    roleDescription: runtimeData.role?.description,
    tools: toolset.tools,
    providers: runtimeData.providers,
    workspaceBasePath: loaderConfig.workspaceBasePath,
    workspaceFilesystem: runtimeData.agent.workspaceFilesystem as unknown as WorkspaceFilesystemConfig | undefined,
    workspaceSandbox: runtimeData.agent.workspaceSandbox as unknown as WorkspaceSandboxConfig | undefined,
    workspaceSkills: runtimeData.agent.workspaceSkills as unknown as WorkspaceSkillsConfig | undefined,
    workspaceEmbedder: runtimeData.agent.workspaceEmbedder as unknown as WorkspaceEmbedderId,
  };
}
