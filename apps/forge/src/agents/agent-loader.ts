import { errorMsg } from './error-formatting';
import { forgeDebug } from '@forge-runtime/core';

import type { Database } from '../database/client';
import { createInternalAgentRuntime } from './create-forge-agent';
import type { InternalAgentRuntime } from './runtime/types';
import { loadAgentRuntimeData } from './agent-loader-data';
import { loadAgentToolset } from './agent-loader-tools';
import type { AgentLoaderConfig, SingleAgentLoaderConfig } from './agent-loader-types';
export type { AgentLoaderConfig, SingleAgentLoaderConfig };
import { buildAgentRuntimeConfig } from './agent-loader-runtime-config';
import { createAgentContractStore } from './agent-contract-store';
import { createSystemSettingsStore } from '../system-settings/store';

/**
 * Load agent configuration from database and create agent instance
 *
 * @param db - Database connection
 * @param config - Agent loader configuration with agentId and optional workspaceBasePath
 * @returns Configured agent instance
 * @throws Error if agent not found in database
 */
export async function loadAgent(db: Database, config: SingleAgentLoaderConfig) {
  const systemSettings = createSystemSettingsStore(db);
  const runtimeData = await loadAgentRuntimeData(db, config);
  const allowedToolIds = new Set(runtimeData.capabilitySet.toolIds);

  forgeDebug({
    scope: 'agent-loader',
    level: 'info',
    agentId: runtimeData.agent.id,
    agentName: runtimeData.agent.name,
    message: 'Loading agent',
  });
  forgeDebug({
    scope: 'agent-loader',
    level: 'info',
    agentId: runtimeData.agent.id,
    message: 'Allowed tool IDs',
    context: { toolIdCount: allowedToolIds.size },
  });
  await config.internalChat.registerAgentAccount({
    agentId: runtimeData.agent.id,
    displayName:
      runtimeData.providerCredentials['internal-chat']?.displayName ?? runtimeData.agent.name,
    agentName: runtimeData.agent.name,
    agentDescription: runtimeData.agent.description ?? undefined,
    roleName: runtimeData.role?.name,
    roleDescription: runtimeData.role?.description,
  });
  const toolset = await loadAgentToolset({
    db,
    loaderConfig: config,
    agentId: runtimeData.agent.id,
    agentName: runtimeData.agent.name,
    allowedToolIds,
  });

  forgeDebug({
    scope: 'agent-loader',
    level: 'info',
    agentId: runtimeData.agent.id,
    message: 'Tools loaded',
    context: toolset.breakdown,
  });

  const runtime = await createInternalAgentRuntime(
    buildAgentRuntimeConfig(config, runtimeData, toolset),
    {
      longTermMemory: true,
      contractStore: createAgentContractStore(db),
      readRuntimeMemorySettings: async () => {
        const settings = await systemSettings.getSettings();

        return {
          checkpointedOmTotalContextTokens: settings.checkpointedOmTotalContextTokens,
          checkpointedOmRecentRawTokens: settings.checkpointedOmRecentRawTokens,
          checkpointedOmRawObservationBatchTokens: settings.checkpointedOmRawObservationBatchTokens,
          checkpointedOmObservationReflectionBatchTokens:
            settings.checkpointedOmObservationReflectionBatchTokens,
          checkpointedOmObservationSupportTokens: settings.checkpointedOmObservationSupportTokens,
          checkpointedOmReflectionSupportTokens: settings.checkpointedOmReflectionSupportTokens,
          ltmRecallSearchMode: settings.ltmRecallSearchMode,
          ltmRecallWorkspaceTopK: settings.ltmRecallWorkspaceTopK,
          ltmRecallGraphTopK: settings.ltmRecallGraphTopK,
          ltmRecallGraphThreshold: settings.ltmRecallGraphThreshold,
          ltmRecallGraphRandomWalkSteps: settings.ltmRecallGraphRandomWalkSteps,
          ltmRecallGraphIncludeSources: settings.ltmRecallGraphIncludeSources,
          ltmRecallScoreThreshold: settings.ltmRecallScoreThreshold,
          ltmRecallDocumentCount: settings.ltmRecallDocumentCount,
        };
      },
    },
  );

  forgeDebug({
    scope: 'agent-loader',
    level: 'info',
    agentId: runtimeData.agent.id,
    message: 'Agent loaded successfully',
  });
  return runtime;
}

/**
 * Load multiple agents from database
 *
 * @param db - Database connection
 * @param config - Agent loader configuration
 * @returns Map of agent instances keyed by agent ID
 */
export async function loadAgents(db: Database, config: AgentLoaderConfig) {
  // Fetch all agent configurations from database
  const agentConfigs = await db.query.agents.findMany();

  if (agentConfigs.length === 0) {
    forgeDebug({ scope: 'agent-loader', level: 'info', message: 'No agents found in registry' });
    return new Map<string, InternalAgentRuntime>();
  }

  forgeDebug({
    scope: 'agent-loader',
    level: 'info',
    message: 'Loading agents from registry',
    context: { agentCount: agentConfigs.length },
  });

  const agents = new Map<string, InternalAgentRuntime>();

  const results = await Promise.allSettled(
    agentConfigs.map((agentConfig) =>
      loadAgent(db, {
        workspaceBasePath: config.workspaceBasePath,
        githubApps: config.githubApps,
        emailMailboxes: config.emailMailboxes,
        coolify: config.coolify,
        minimax: config.minimax,
        schedules: config.schedules,
        internalChat: config.internalChat,
        agentId: agentConfig.id,
      }),
    ),
  );

  results.forEach((result, index) => {
    const agentId = agentConfigs[index]!.id;
    if (result.status === 'fulfilled') {
      agents.set(agentId, result.value);
    } else {
      forgeDebug({
        scope: 'agent-loader',
        level: 'error',
        agentId,
        message: 'Failed to load agent',
        context: { error: errorMsg(result.reason) },
      });
    }
  });

  forgeDebug({
    scope: 'agent-loader',
    level: 'info',
    message: 'Agent loading complete',
    context: {
      totalAgents: agentConfigs.length,
      loadedAgents: agents.size,
      failedAgents: agentConfigs.length - agents.size,
    },
  });
  return agents;
}
