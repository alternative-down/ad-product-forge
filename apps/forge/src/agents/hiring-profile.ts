import type {Database} from '../database/client'
import { createLlmSettingsStore } from '../llm/settings-store';
import { forgeDebug } from '@forge-runtime/core';

export async function buildHiredAgentProfile(db: Database, input: {
  agentName: string;
  agentDescription?: string;
}) {
  try {
    const llmSettings = createLlmSettingsStore(db);
    const defaults = await llmSettings.getResolvedDefaults();

    return {
      name: input.agentName.trim(),
      description: input.agentDescription?.trim(),
      modelProfileId: defaults.primaryProfile.profileId,
      omModelProfileId: defaults.omProfile.profileId,
    };
  } catch (err) {
    forgeDebug({ scope: 'hiring-profile', level: 'error', message: 'buildHiredAgentProfile failed', context: { error: err instanceof Error ? err.message : String(err) }});
    throw err;
  }
}