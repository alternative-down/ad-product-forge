import type { AgentRuntimeData } from './agent-loader-data';
import type { AgentToolset } from './agent-loader-tools';
import type { CreateAgentConfig } from './runtime/types';
import {
  WorkspaceFilesystemConfigSchema,
  WorkspaceSandboxConfigSchema,
  WorkspaceSkillsConfigSchema,
} from '../database/schema';
import { resolveWorkspaceEmbedderId } from '@forge-runtime/core';
import type { z } from 'zod';
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
    communicationGroupFlushingEnabled:
      runtimeData.companySettings.communicationGroupFlushingEnabled,
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
    workspaceFilesystem: parseWorkspaceJsonConfig(
      runtimeData.agent.workspaceFilesystem,
      WorkspaceFilesystemConfigSchema,
    ),
    workspaceSandbox: parseWorkspaceJsonConfig(
      runtimeData.agent.workspaceSandbox,
      WorkspaceSandboxConfigSchema,
    ),
    workspaceSkills: parseWorkspaceJsonConfig(
      runtimeData.agent.workspaceSkills,
      WorkspaceSkillsConfigSchema,
    ),
    workspaceEmbedder: resolveWorkspaceEmbedderId(runtimeData.agent.workspaceEmbedder),
  };
}

/**
 * Parses and validates a JSON-encoded workspace config field from the agents table.
 * Returns undefined for null/undefined/empty input. Throws on malformed JSON
 * or schema validation failure (the value was stored by HireInternalAgentInput
 * validation, so this should not happen in practice).
 */
function parseWorkspaceJsonConfig<T>(
  value: string | null | undefined,
  schema: z.ZodType<T>,
): T | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }
  return schema.parse(JSON.parse(value));
}
