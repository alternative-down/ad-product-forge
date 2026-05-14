import { forgeDebug } from '@forge-runtime/core';
import { eq } from 'drizzle-orm';


import type {Database} from '../database/schema';
import { agents, agentProviders } from '../database/schema';
import type { SingleAgentLoaderConfig } from './agent-loader-types';
import { createLlmSettingsStore } from '../llm/settings-store';
import { resolveProfileRuntimeModel } from '../llm/runtime-model';
import { createSystemSettingsStore } from '../system-settings/store';
import { createCapabilityStore } from '../capabilities/store';
import { decryptSecret } from '../encryption/crypto';
import { loadCommunicationProviders, type ProviderCredentialsMap } from '../communication/provider-loader';

const communicationProviderTypes: Record<keyof ProviderCredentialsMap, true> = {
  'internal-chat': true,
  discord: true,
  email: true,
};

export async function loadAgentRuntimeData(db: Database, config: SingleAgentLoaderConfig) {
  let agent;
  try {
    agent = await db.query.agents.findFirst({
      where: eq(agents.id, config.agentId),
    });
  } catch (err) {
    forgeDebug({ scope: 'agent-loader-data', level: 'error', message: 'loadAgentRuntimeData: read agents failed', context: { agentId: config.agentId, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }

  if (!agent) {
    forgeDebug({ scope: 'agent-loader-data', level: 'warn', message: 'loadAgentData: agent not in registry', context: { agentId: config.agentId } });
    throw new Error(`Agent not found in registry: ${config.agentId}`);
  }

  if (!agent.roleId) {
    forgeDebug({ scope: 'agent-loader-data', level: 'warn', message: 'loadAgentData: agent missing roleId', context: { agentId: config.agentId } });
    throw new Error(`Agent is missing roleId: ${config.agentId}`);
  }

  const llmSettings = createLlmSettingsStore(db);
  const systemSettings = createSystemSettingsStore(db);
  const capabilities = createCapabilityStore(db);
  let providerConfigs;
  try {
    providerConfigs = await db.query.agentProviders.findMany({
      where: eq(agentProviders.agentId, config.agentId),
    });
  } catch (err) {
    forgeDebug({ scope: 'agent-loader-data', level: 'error', message: 'loadAgentRuntimeData: read agentProviders failed', context: { agentId: config.agentId, error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
  const providerCredentials: ProviderCredentialsMap = {};

  for (const providerConfig of providerConfigs) {
    if (!(providerConfig.providerType in communicationProviderTypes)) {
      continue;
    }

    let decrypted: string;
    try {
      decrypted = decryptSecret(providerConfig.encryptedCredentials);
    } catch (error) {
      forgeDebug({ scope: 'agent-loader-data', level: 'error', message: 'Failed to decrypt credentials for agent ' + config.agentId, context: { provider: providerConfig.providerType, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }

    let credentials: unknown;
    try {
      credentials = JSON.parse(decrypted);
    } catch (error) {
      forgeDebug({ scope: 'agent-loader-data', level: 'error', message: 'Failed to parse decrypted credentials JSON for agent ' + config.agentId, context: { provider: providerConfig.providerType, error: error instanceof Error ? error.message : String(error) } });
      throw error;
    }

    providerCredentials[providerConfig.providerType as keyof ProviderCredentialsMap] = credentials;
  }

  const [primaryProfile, omProfile, companySettings, role, capabilitySet] = await Promise.all([
    llmSettings.getProfile(agent.modelProfileId),
    llmSettings.getProfile(agent.omModelProfileId),
    systemSettings.getSettings(),
    capabilities.getRole(agent.roleId),
    capabilities.getAgentCapabilities(agent.id),
  ]);
  const [primaryRuntimeModel, omRuntimeModel] = await Promise.all([
    resolveProfileRuntimeModel(primaryProfile),
    resolveProfileRuntimeModel(omProfile),
  ]);

  const providers = await loadCommunicationProviders(providerCredentials, {
    internalChat: config.internalChat,
  });

  return {
    agent,
    role,
    capabilitySet,
    companySettings,
    primaryProfile,
    omProfile,
    primaryRuntimeModel,
    omRuntimeModel,
    providerCredentials,
    providers,
  };
}
