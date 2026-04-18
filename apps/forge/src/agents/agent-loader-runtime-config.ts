import type { CreateAgentConfig } from './agent-runtime-types';
import type { AgentLoaderConfig } from './agent-loader-types';
import type { loadAgentRuntimeData } from './agent-loader-data';
import type { loadAgentToolset } from './agent-loader-tools';
import { filterWorkflows } from './agent-loader-workflows';

type AgentRuntimeData = Awaited<ReturnType<typeof loadAgentRuntimeData>>;
type AgentToolset = Awaited<ReturnType<typeof loadAgentToolset>>;

export function buildAgentRuntimeConfig(
  loaderConfig: AgentLoaderConfig,
  runtimeData: AgentRuntimeData,
  toolset: AgentToolset,
): CreateAgentConfig {
  return {
    id: runtimeData.agent.id,
    name: runtimeData.agent.name,
    description: runtimeData.agent.description || undefined,
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
    workflows: filterWorkflows(loaderConfig.workflows, runtimeData.capabilitySet.workflowIds),
    workspaceBasePath: loaderConfig.workspaceBasePath,
    workspaceFilesystem: runtimeData.agent.workspaceFilesystem ?? undefined,
    workspaceSandbox: runtimeData.agent.workspaceSandbox ?? undefined,
    workspaceSkills: runtimeData.agent.workspaceSkills ?? undefined,
    workspaceEmbedder: runtimeData.agent.workspaceEmbedder,
  };
}
