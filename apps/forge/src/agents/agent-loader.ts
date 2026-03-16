import { eq } from 'drizzle-orm';
import type { Database } from '../database/index.js';
import { agents, agentProviders } from '../database/schema.js';
import { createAgent } from './create-forge-agent.js';
import type { CreateForgeAgentConfig } from './create-forge-agent.js';
import type { CommunicationProvider } from '@mastra-engine/core';
import { loadCommunicationProviders, type ProviderCredentialsMap } from '../communication/provider-loader.js';

export interface AgentLoaderConfig {
  agentId: string;
  workspaceBasePath: string;
}

/**
 * Load agent configuration from database and create agent instance
 *
 * @param db - Database connection
 * @param config - Agent loader configuration with agentId and optional workspaceBasePath
 * @returns Configured agent instance
 * @throws Error if agent not found in database
 */
export async function loadAgent(db: Database, config: AgentLoaderConfig) {
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
      // Parse credentials from encrypted_credentials field (no decryption yet)
      const credentials = JSON.parse(providerConfig.encryptedCredentials);
      providerCredentials[providerConfig.providerType as keyof ProviderCredentialsMap] = credentials;
    } catch (error) {
      console.warn(`[AgentLoader] Failed to parse credentials for provider ${providerConfig.providerType}:`, error);
    }
  }

  const providers = loadCommunicationProviders(providerCredentials);

  // Create agent from database configuration
  const agent = await createAgent(
    {
      id: agentConfig.id,
      name: agentConfig.name,
      description: agentConfig.description || undefined,
      instructions: agentConfig.instructions,
      model: agentConfig.model,
      omModel: agentConfig.omModel || undefined,
      tools: agentConfig.tools ? JSON.parse(agentConfig.tools) : undefined,
      workflows: agentConfig.workflows ? JSON.parse(agentConfig.workflows) : undefined,
      providers,
      workspaceBasePath: config.workspaceBasePath,
      workspaceAutoSync: agentConfig.workspaceAutoSync === 1,
      workspaceBm25: agentConfig.workspaceBm25 === 1,
      workspaceEmbedder: agentConfig.workspaceEmbedder || undefined,
      workspaceFilesystem: agentConfig.workspaceFilesystem ? JSON.parse(agentConfig.workspaceFilesystem) : undefined,
      workspaceSandbox: agentConfig.workspaceSandbox ? JSON.parse(agentConfig.workspaceSandbox) : undefined,
    },
    { longTermMemory: true }
  );

  console.log(`[AgentLoader] Agent loaded successfully: ${agentConfig.id}`);
  return agent;
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

  const agents = new Map();

  for (const agentConfig of agentConfigs) {
    try {
      const agent = await loadAgent(db, {
        agentId: agentConfig.id,
        workspaceBasePath: config.workspaceBasePath,
      });
      agents.set(agentConfig.id, agent);
    } catch (error) {
      console.error(`[AgentLoader] Failed to load agent ${agentConfig.id}:`, error);
      // Continue loading other agents even if one fails
    }
  }

  console.log(`[AgentLoader] Successfully loaded ${agents.size} agents`);
  return agents;
}
