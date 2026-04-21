import type { Database } from '../database/index';
import { createInternalAgentRuntime } from './create-forge-agent';
import type { InternalAgentRuntime } from './agent-runtime-types';
import { loadAgentRuntimeData } from './agent-loader-data';
import { loadAgentToolset } from './agent-loader-tools';
import type { AgentLoaderConfig, SingleAgentLoaderConfig } from './agent-loader-types';
import { buildAgentRuntimeConfig } from './agent-loader-runtime-config';
import { createAgentContractStore } from './agent-contract-store';
import { createSystemSettingsStore } from '../system-settings/store';

export type { AgentLoaderConfig, SingleAgentLoaderConfig } from './agent-loader-types';

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

  console.log(`[AgentLoader] Loading agent: ${runtimeData.agent.id} (${runtimeData.agent.name})`);
  console.log(`[AgentLoader] Allowed tool IDs for ${runtimeData.agent.id}:`, {
    count: allowedToolIds.size,
    toolIds: Array.from(allowedToolIds),
  });
  await config.internalChat.registerAgentAccount({
    agentId: runtimeData.agent.id,
    displayName: runtimeData.providerCredentials['internal-chat']?.displayName ?? runtimeData.agent.name,
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

  console.log(`[AgentLoader] Tools loaded for ${runtimeData.agent.id}:`, toolset.breakdown);

  const runtime = await createInternalAgentRuntime(buildAgentRuntimeConfig(config, runtimeData, toolset), {
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
        ltmRecallScoreThreshold: settings.ltmRecallScoreThreshold,
        ltmRecallDocumentCount: settings.ltmRecallDocumentCount,
      };
    },
  });

  console.log(`[AgentLoader] Agent loaded successfully: ${runtimeData.agent.id}`);
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
    console.log('[AgentLoader] No agents found in registry');
    return new Map<string, InternalAgentRuntime>();
  }

  console.log(`[AgentLoader] Loading ${agentConfigs.length} agents from registry...`);

  const agents = new Map<string, InternalAgentRuntime>();

  for (const agentConfig of agentConfigs) {
    try {
      const runtime = await loadAgent(db, {
        workspaceBasePath: config.workspaceBasePath,
        githubApps: config.githubApps,
        emailMailboxes: config.emailMailboxes,
        coolify: config.coolify,
        minimax: config.minimax,
        schedules: config.schedules,
        internalChat: config.internalChat,
        agentId: agentConfig.id,
      });
      agents.set(agentConfig.id, runtime);
    } catch (error) {
      console.error(`[AgentLoader] Failed to load agent ${agentConfig.id}:`, error);
      // Continue loading other agents even if one fails
    }
  }

  console.log(`[AgentLoader] Successfully loaded ${agents.size} agents`);
  return agents;
}
