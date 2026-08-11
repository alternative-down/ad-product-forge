import { forgeDebug } from '@forge-runtime/core';
import { eq } from 'drizzle-orm';

import type { Database } from '../database/client';
import { agents, agentProviders } from '../database/schema';
import { withDbErrorLogging } from '../database/error-logging';
import type { SingleAgentLoaderConfig } from './agent-loader-types';
import { createLlmSettingsStore } from '../llm/settings-store';
import { resolveProfileRuntimeModel } from '../llm/runtime-model';
import { createSystemSettingsStore } from '../system-settings/store';
import { createCapabilityStore } from '../capabilities/store';
import { decryptSecret } from '../encryption/crypto';
import {
  loadCommunicationProviders,
  type ProviderCredentialsMap,
} from '../communication/provider-loader';



/**
 * Module-local debug helper for agent-loader-data.ts.
 * Bakes in scope=agent-loader-data so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 2 forgeDebug call-sites in this file all use scope=agent-loader-data
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *
 * Usage:
 *   agentLoaderDataDebug('warn', 'loadAgentData: agent not in registry', { agentId: config.agentId });
 */
function agentLoaderDataDebug(
  level: 'warn',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'agent-loader-data',
    level,
    message,
    ...context,
  });
}

const communicationProviderTypes: Record<keyof ProviderCredentialsMap, true> = {
  'internal-chat': true,
  discord: true,
  email: true,
};

// Re-exported type alias so consumers don't need Awaited<ReturnType<...>>
export type AgentRuntimeData = Awaited<ReturnType<typeof loadAgentRuntimeData>>;

export async function loadAgentRuntimeData(db: Database, config: SingleAgentLoaderConfig) {
  const agent = await db.query.agents.findFirst({
    where: eq(agents.id, config.agentId),
  });

  if (agent === undefined) {
    agentLoaderDataDebug('warn', 'loadAgentData: agent not in registry', { agentId: config.agentId });
    throw new Error(`Agent not found in registry: ${config.agentId}`);
  }

  if (agent.roleId === null || agent.roleId === undefined) {
    agentLoaderDataDebug('warn', 'loadAgentData: agent missing roleId', { agentId: config.agentId });
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

    const decrypted = await withDbErrorLogging({
      scope: 'agent-loader-data',
      op: 'decryptCredentials',
      verb: 'read',
      context: {
        provider: providerConfig.providerType,
        agentId: config.agentId,
      },
      fn: () => decryptSecret(providerConfig.encryptedCredentials),
    });

    const credentials = await withDbErrorLogging({
      scope: 'agent-loader-data',
      op: 'parseCredentials',
      verb: 'read',
      context: {
        provider: providerConfig.providerType,
        agentId: config.agentId,
      },
      fn: () => JSON.parse(decrypted),
    });

    // Schema gap: credentials is parsed from JSON at runtime and matches
    // the per-provider shape validated by Zod above, but the static union
    // type ProviderCredentialsMap[keyof ProviderCredentialsMap] is wider
    // than any single value can express. Cast to the per-key value type so
    // the assignment type-checks against the precise indexed slot.
    providerCredentials[providerConfig.providerType as keyof ProviderCredentialsMap] =
      credentials as ProviderCredentialsMap[typeof providerConfig.providerType extends keyof ProviderCredentialsMap
        ? typeof providerConfig.providerType
        : never];
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
