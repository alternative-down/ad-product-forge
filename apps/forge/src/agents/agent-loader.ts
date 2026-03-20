import { eq } from 'drizzle-orm';
import type { Database } from '../database/index.js';
import { agents, agentProviders } from '../database/schema.js';
import { createInternalAgentRuntime, type CreateAgentConfig, type InternalAgentRuntime } from './create-forge-agent.js';
import { loadCommunicationProviders, type ProviderCredentialsMap } from '../communication/provider-loader.js';
import { decryptSecret } from '../encryption/crypto.js';
import { createMicroErpTools } from '../micro-erp/tools.js';
import { createAgentNotificationTools } from '../notifications/tools.js';
import { createGitHubTools } from '../github/tools.js';
import type { GitHubAppManager } from '../github/manager.js';
import type { CoolifyManager } from '../coolify/manager.js';
import { createCoolifyTools } from '../coolify/tools.js';
import type { createAgentScheduleManager } from '../schedules/manager.js';
import { createAgentScheduleTools } from '../schedules/tools.js';
import { createCapabilityStore } from '../capabilities/store.js';
import { createCapabilityTools } from '../capabilities/tools.js';

export interface AgentLoaderConfig {
  workspaceBasePath: string;
  workflows?: CreateAgentConfig['workflows'];
  githubApps: GitHubAppManager;
  coolify: CoolifyManager | null;
  schedules: ReturnType<typeof createAgentScheduleManager>;
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
  // Fetch agent configuration from database
  const agentConfig = await db.query.agents.findFirst({
    where: eq(agents.id, config.agentId),
  });

  if (!agentConfig) {
    throw new Error(`Agent not found in registry: ${config.agentId}`);
  }

  console.log(`[AgentLoader] Loading agent: ${agentConfig.id} (${agentConfig.name})`);

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

  const providers = loadCommunicationProviders(providerCredentials);
  const capabilities = createCapabilityStore(db);
  const capabilitySet = await capabilities.getAgentCapabilities(agentConfig.id);
  const tools = createMicroErpTools(db);
  const notificationTools = createAgentNotificationTools(db, agentConfig.id);
  const githubTools = createGitHubTools(agentConfig.id, config.githubApps);
  const coolifyTools = config.coolify ? createCoolifyTools(config.coolify) : {};
  const scheduleTools = createAgentScheduleTools(agentConfig.id, config.schedules);
  const capabilityTools = createCapabilityTools(db, config);
  const customTools = {
    ...tools,
    ...notificationTools,
    ...githubTools,
    ...coolifyTools,
    ...scheduleTools,
    ...capabilityTools,
  };
  const filteredWorkflows = filterWorkflows(config.workflows, capabilitySet?.workflowIds ?? null);

  const runtime = await createInternalAgentRuntime(
    {
      id: agentConfig.id,
      name: agentConfig.name,
      description: agentConfig.description || undefined,
      instructions: agentConfig.instructions,
      model: agentConfig.model,
      omModel: agentConfig.omModel || undefined,
      tools: filterCustomTools(customTools, capabilitySet?.toolIds ?? null),
      providers,
      workflows: filteredWorkflows,
      allowedCustomToolIds: capabilitySet?.toolIds ?? null,
      workspaceBasePath: config.workspaceBasePath,
      workspaceFilesystem: agentConfig.workspaceFilesystem ?? undefined,
      workspaceSandbox: agentConfig.workspaceSandbox ?? undefined,
    },
    { longTermMemory: true }
  );

  console.log(`[AgentLoader] Agent loaded successfully: ${agentConfig.id}`);
  return runtime;
}

function filterCustomTools<TTools extends Record<string, unknown>>(tools: TTools, allowedToolIds: string[] | null) {
  if (!allowedToolIds) {
    return tools;
  }

  const allowedToolIdSet = new Set(allowedToolIds);

  return Object.fromEntries(
    Object.entries(tools).filter(([, tool]) => {
      if (!tool || typeof tool !== 'object' || !('id' in tool) || typeof tool.id !== 'string') {
        return false;
      }

      return allowedToolIdSet.has(tool.id);
    }),
  ) as TTools;
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
    throw new Error('No agents found in registry. Run init-registry first.');
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
        schedules: config.schedules,
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
