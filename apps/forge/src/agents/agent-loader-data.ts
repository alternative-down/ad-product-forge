import { forgeDebug } from '@forge-runtime/core';
import { eq } from 'drizzle-orm';

import type { Database } from '../database/index';
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
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, config.agentId),
  });

  if (!agent) {
    throw new Error(`Agent not found in registry: ${config.agentId}`);
  }

  if (!agent.roleId) {
    throw new Error(`Agent is missing roleId: ${config.agentId}`);
  }

  const llmSettings = createLlmSettingsStore(db);
  const systemSettings = createSystemSettingsStore(db);
  const capabilities = createCapabilityStore(db);
  const providerConfigs = await db.query.agentProviders.findMany({
    where: eq(agentProviders.agentId, config.agentId),
  });
  const providerCredentials: ProviderCredentialsMap = {};

  for (const providerConfig of providerConfigs) {
    if (!(providerConfig.providerType in communicationProviderTypes)) {
      continue;
    }

    try {
      const decrypted = decryptSecret(providerConfig.encryptedCredentials);
      const credentials = JSON.parse(decrypted);
      providerCredentials[providerConfig.providerType as keyof ProviderCredentialsMap] = credentials;
    } catch (error) {
      forgeDebug({ scope: 'agent-loader-data', level: 'error', message: 'Failed to decrypt/parse credentials for agent ' + config.agentId + ': ' + String(error), context: { provider: providerConfig.providerType } });
    }
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
