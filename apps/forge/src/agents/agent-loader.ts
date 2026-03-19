import { eq } from 'drizzle-orm';
import type { Database } from '../database/index.js';
import { agents, agentProviders } from '../database/schema.js';
import { createInternalAgentRuntime, type CreateAgentConfig, type InternalAgentRuntime } from './create-forge-agent.js';
import { loadCommunicationProviders, type ProviderCredentialsMap } from '../communication/provider-loader.js';
import { decryptSecret } from '../encryption/crypto.js';

export interface AgentLoaderConfig {
  workspaceBasePath: string;
  workflows?: CreateAgentConfig['workflows'];
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

  const runtime = await createInternalAgentRuntime(
    {
      id: agentConfig.id,
      name: agentConfig.name,
      description: agentConfig.description || undefined,
      instructions: agentConfig.instructions,
      model: agentConfig.model,
      omModel: agentConfig.omModel || undefined,
      providers,
      workflows: config.workflows,
      workspaceBasePath: config.workspaceBasePath,
      workspaceFilesystem: agentConfig.workspaceFilesystem ?? undefined,
      workspaceSandbox: agentConfig.workspaceSandbox ?? undefined,
    },
    { longTermMemory: true }
  );

  console.log(`[AgentLoader] Agent loaded successfully: ${agentConfig.id}`);
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
    throw new Error('No agents found in registry. Run init-registry first.');
  }

  console.log(`[AgentLoader] Loading ${agentConfigs.length} agents from registry...`);

  const agents = new Map<string, InternalAgentRuntime>();

  for (const agentConfig of agentConfigs) {
    try {
      const runtime = await loadAgent(db, {
        workspaceBasePath: config.workspaceBasePath,
        workflows: config.workflows,
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
