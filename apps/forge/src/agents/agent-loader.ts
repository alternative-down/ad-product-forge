import { errorMsg } from './error-formatting';
import { AgentLoaderMissingCapabilityError } from './agent-loader.errors';
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
 * Module-local debug helper. Centralizes the agent-loader scope.
 *
 * Pass-through options for agentId, agentName, and context so call sites can
 * attach top-level structured fields without re-stating the scope (L#NN-50 #50
 * log retention: helpers must preserve all original forgeDebug fields).
 */
function agentLoaderDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  options?: { agentId?: string; agentName?: string; context?: Record<string, unknown> },
) {
  if (options === undefined) {
    forgeDebug({ scope: 'agent-loader', level, message });
  } else {
    forgeDebug({ scope: 'agent-loader', level, message, ...options });
  }
}


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

  agentLoaderDebug('info', 'Loading agent', { agentId: runtimeData.agent.id, agentName: runtimeData.agent.name });
  agentLoaderDebug('info', 'Allowed tool IDs', { agentId: runtimeData.agent.id, context: { toolIdCount: allowedToolIds.size } });
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

  agentLoaderDebug('info', 'Tools loaded', { agentId: runtimeData.agent.id, context: toolset.breakdown });

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

  agentLoaderDebug('info', 'Agent loaded successfully', { agentId: runtimeData.agent.id });
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
    agentLoaderDebug('info', 'No agents found in registry');
    return new Map<string, InternalAgentRuntime>();
  }

  agentLoaderDebug('info', 'Loading agents from registry', { context: { agentCount: agentConfigs.length } });

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

  // #5978: collect all per-agent failures, surface them all (not just the first).
  // Use Promise.allSettled so we can log AND report every failing agentId, then
  // throw an aggregate error so callers can react to partial-failure as a unit.
  const failures: Array<{ agentId: string; reason: unknown }> = [];
  results.forEach((result, index) => {
    const agentId = agentConfigs[index]!.id;
    if (result.status === 'fulfilled') {
      agents.set(agentId, result.value);
    } else {
      failures.push({ agentId, reason: result.reason });
      agentLoaderDebug('error', 'Failed to load agent', { agentId, context: { error: errorMsg(result.reason) } });
    }
  });

  agentLoaderDebug('info', 'Agent loading complete', { context: { totalAgents: agentConfigs.length, loadedAgents: agents.size, failedAgents: failures.length } });

  // #5978: loadAgents MUST NOT silently swallow per-agent failures. If any
  // agent failed to load, throw an aggregate error so callers can react.
  if (failures.length > 0) {
    const summary = failures
      .map((f) => f.agentId + ':' + errorMsg(f.reason))
      .join(', ');
    throw new AgentLoaderMissingCapabilityError(
      'loadAgents: ' + failures.length + ' of ' + agentConfigs.length +
      ' agents failed to load (' + summary + ')'
    );
  }

  return agents;
}
