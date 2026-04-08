import type { Database } from '../database/index';
import { createInternalAgentRuntime, type CreateAgentConfig, type InternalAgentRuntime } from './create-forge-agent';
import type { InternalChatService } from '../communication/internal-chat-service';
import type { GitHubAppManager } from '../github/manager';
import type { CoolifyManager } from '../coolify/manager';
import type { MiniMaxManager } from '../minimax/manager';
import type { createAgentScheduleManager } from '../schedules/manager';
import { loadAgentRuntimeData } from './agent-loader-data';
import { loadAgentToolset } from './agent-loader-tools';

export interface AgentLoaderConfig {
  workspaceBasePath: string;
  workflows?: CreateAgentConfig['workflows'];
  githubApps: GitHubAppManager;
  coolify: CoolifyManager | null;
  minimax?: MiniMaxManager;
  schedules: ReturnType<typeof createAgentScheduleManager>;
  internalChat: InternalChatService;
}

export interface SingleAgentLoaderConfig extends AgentLoaderConfig {
  agentId: string;
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

  const runtime = await createInternalAgentRuntime(
    {
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
      roleName: runtimeData.role?.name,
      roleDescription: runtimeData.role?.description,
      tools: toolset.tools,
      providers: runtimeData.providers,
      workflows: filterWorkflows(config.workflows, runtimeData.capabilitySet.workflowIds),
      workspaceBasePath: config.workspaceBasePath,
      workspaceFilesystem: runtimeData.agent.workspaceFilesystem ?? undefined,
      workspaceSandbox: runtimeData.agent.workspaceSandbox ?? undefined,
      workspaceSkills: runtimeData.agent.workspaceSkills ?? undefined,
    },
    { longTermMemory: true },
  );

  console.log(`[AgentLoader] Agent loaded successfully: ${runtimeData.agent.id}`);
  return runtime;
}

function filterWorkflows(
  workflows: CreateAgentConfig['workflows'],
  allowedWorkflowIds: string[] | null,
): CreateAgentConfig['workflows'] {
  if (!workflows || !allowedWorkflowIds) {
    return workflows;
  }

  const allowedWorkflowIdSet = new Set(allowedWorkflowIds);

  if (typeof workflows === 'function') {
    return async (context) => {
      const resolvedWorkflows = await workflows(context);

      return Object.fromEntries(
        Object.entries(resolvedWorkflows).filter(([, workflow]) => allowedWorkflowIdSet.has(workflow.id)),
      );
    };
  }

  return Object.fromEntries(
    Object.entries(workflows).filter(([, workflow]) => allowedWorkflowIdSet.has(workflow.id)),
  );
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
        workflows: config.workflows,
        githubApps: config.githubApps,
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
