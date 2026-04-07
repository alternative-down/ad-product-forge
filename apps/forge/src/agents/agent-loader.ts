import { eq } from 'drizzle-orm';
import type { ToolsInput } from '@mastra/core/agent';
import type { Tool } from '@mastra/core/tools';
import type { Database } from '../database/index';
import { agents, agentProviders } from '../database/schema';
import { createInternalAgentRuntime, type CreateAgentConfig, type InternalAgentRuntime } from './create-forge-agent';
import { loadCommunicationProviders, type ProviderCredentialsMap } from '../communication/provider-loader';
import type { InternalChatService } from '../communication/internal-chat-service';
import { decryptSecret } from '../encryption/crypto';
import { createMicroErpTools } from '../micro-erp/tools';
import { createAgentNotificationTools } from '../notifications/tools';
import { createGitHubTools } from '../github/tools';
import type { GitHubAppManager } from '../github/manager';
import type { CoolifyManager } from '../coolify/manager';
import type { MiniMaxManager } from '../minimax/manager';
import { createCoolifyTools } from '../coolify/tools';
import type { createAgentScheduleManager } from '../schedules/manager';
import { createAgentScheduleTools } from '../schedules/tools';
import { createCapabilityStore } from '../capabilities/store';
import { createCapabilityTools } from '../capabilities/tools';
import { createLlmSettingsStore } from '../llm/settings-store';
import { resolveProfileRuntimeModel } from '../llm/runtime-model';
import { createSystemSettingsStore } from '../system-settings/store';
import { getMCPToolsForAgent } from './mcp/client-manager';
import { createMiniMaxTools } from '../minimax/tools';
import { createInternalChatTools } from '../communication/internal-chat-tools';


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
 * Load MCP tools for an agent
 * Connects to all configured MCP servers and returns the available tools
 */
async function loadMCPToolsForAgent(
  agentId: string,
): Promise<Record<string, Tool<unknown, unknown>>> {
  try {
    const mcpTools = await getMCPToolsForAgent(agentId);
    
    if (!mcpTools || Object.keys(mcpTools).length === 0) {
      return {};
    }
    
    console.log(`[AgentLoader] Loaded ${Object.keys(mcpTools).length} MCP tool(s) for agent ${agentId}`);
    return mcpTools;
  } catch (error) {
    console.warn(`[AgentLoader] Failed to load MCP tools for agent ${agentId}:`, error);
    return {};
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
  // Fetch agent configuration from database
  const agentConfig = await db.query.agents.findFirst({
    where: eq(agents.id, config.agentId),
  });

  if (!agentConfig) {
    throw new Error(`Agent not found in registry: ${config.agentId}`);
  }

  if (!agentConfig.roleId) {
    throw new Error(`Agent is missing roleId: ${config.agentId}`);
  }

  const llmSettings = createLlmSettingsStore(db);
  const systemSettings = createSystemSettingsStore(db);
  const [primaryProfile, omProfile] = await Promise.all([
    llmSettings.getProfile(agentConfig.modelProfileId),
    llmSettings.getProfile(agentConfig.omModelProfileId),
  ]);
  const companySettings = await systemSettings.getSettings();
  const [primaryRuntimeModel, omRuntimeModel] = await Promise.all([
    resolveProfileRuntimeModel(primaryProfile),
    resolveProfileRuntimeModel(omProfile),
  ]);
  const capabilities = createCapabilityStore(db);
  const role = await capabilities.getRole(agentConfig.roleId);
  const capabilitySet = await capabilities.getAgentCapabilities(agentConfig.id);
  const allowedToolIds = new Set(capabilitySet.toolIds);

  console.log(`[AgentLoader] Loading agent: ${agentConfig.id} (${agentConfig.name})`);
  console.log(`[AgentLoader] Allowed tool IDs for ${agentConfig.id}:`, {
    count: allowedToolIds.size,
    toolIds: Array.from(allowedToolIds),
  });

  // Load providers from agent_providers table
  const providerConfigs = await db.query.agentProviders.findMany({
    where: eq(agentProviders.agentId, config.agentId),
  });

  const providerCredentials: ProviderCredentialsMap = {};

  for (const providerConfig of providerConfigs) {
    if (!(providerConfig.providerType in communicationProviderTypes)) {
      continue;
    }

    try {
      // Decrypt and parse credentials from encrypted_credentials field
      const decrypted = decryptSecret(providerConfig.encryptedCredentials);
      const credentials = JSON.parse(decrypted);
      providerCredentials[providerConfig.providerType as keyof ProviderCredentialsMap] = credentials;
    } catch (error) {
      console.warn(`[AgentLoader] Failed to decrypt/parse credentials for provider ${providerConfig.providerType}:`, error);
    }
  }

  const providers = loadCommunicationProviders(providerCredentials, {
    internalChat: config.internalChat,
  });
  await config.internalChat.registerAgentAccount({
    agentId: agentConfig.id,
    displayName: providerCredentials['internal-chat']?.displayName ?? agentConfig.name,
    agentName: agentConfig.name,
    agentDescription: agentConfig.description ?? undefined,
    roleName: role?.name,
    roleDescription: role?.description,
  });

  const tools = createMicroErpTools(db, allowedToolIds);
  const notificationTools = createAgentNotificationTools(db, agentConfig.id, allowedToolIds);
  const githubTools = createGitHubTools(agentConfig.id, config.githubApps, allowedToolIds);
  const coolifyTools = config.coolify ? createCoolifyTools(config.coolify, allowedToolIds) : {};
  const scheduleTools = createAgentScheduleTools(agentConfig.id, config.schedules, allowedToolIds);
  const capabilityTools = createCapabilityTools(db, config, agentConfig.id, allowedToolIds);
  const internalChatTools = createInternalChatTools(
    agentConfig.id,
    agentConfig.name,
    config.internalChat,
    allowedToolIds,
  );
  const minimaxTools = config.minimax
    ? createMiniMaxTools(config.minimax, allowedToolIds)
    : {};
  
  // Load MCP tools for this agent
  const mcpTools = await loadMCPToolsForAgent(agentConfig.id);

  const customTools: ToolsInput = {
    ...tools,
    ...notificationTools,
    ...githubTools,
    ...coolifyTools,
    ...scheduleTools,
    ...capabilityTools,
    ...internalChatTools,
    ...minimaxTools,
    ...mcpTools,
  };

  console.log(`[AgentLoader] Tools loaded for ${agentConfig.id}:`, {
    microErp: Object.keys(tools).length,
    notifications: Object.keys(notificationTools).length,
    github: Object.keys(githubTools).length,
    coolify: Object.keys(coolifyTools).length,
    schedules: Object.keys(scheduleTools).length,
    capabilities: Object.keys(capabilityTools).length,
    internalChat: Object.keys(internalChatTools).length,
    minimax: Object.keys(minimaxTools).length,
    mcp: Object.keys(mcpTools).length,
    total: Object.keys(customTools).length,
  });

  const filteredWorkflows = filterWorkflows(config.workflows, capabilitySet.workflowIds);

  const runtime = await createInternalAgentRuntime(
    {
      id: agentConfig.id,
      name: agentConfig.name,
      description: agentConfig.description || undefined,
      instructions: agentConfig.instructions,
      model: primaryRuntimeModel,
      pricingModelKey: primaryProfile.modelKey,
      modelProfileId: primaryProfile.profileId,
      omModel: omRuntimeModel,
      omPricingModelKey: omProfile.modelKey,
      omModelProfileId: omProfile.profileId,
      companyName: companySettings.companyName,
      companyContext: companySettings.companyContext,
      roleName: role?.name,
      roleDescription: role?.description,
      tools: customTools,
      providers,
      workflows: filteredWorkflows,
      workspaceBasePath: config.workspaceBasePath,
      workspaceFilesystem: agentConfig.workspaceFilesystem ?? undefined,
      workspaceSandbox: agentConfig.workspaceSandbox ?? undefined,
      workspaceSkills: agentConfig.workspaceSkills ?? undefined,
    },
    { longTermMemory: true }
  );

  console.log(`[AgentLoader] Agent loaded successfully: ${agentConfig.id}`);
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

const communicationProviderTypes: Record<keyof ProviderCredentialsMap, true> = {
  'internal-chat': true,
  discord: true,
  email: true,
};

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
