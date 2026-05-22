import type { Database } from '../database/client';
import { createLlmSettingsStore } from '../llm/settings-store';
import { forgeDebug } from '@forge-runtime/core'; // eslint-disable-line @typescript-eslint/no-unused-vars

export async function buildHiredAgentProfile(
  db: Database,
  input: {
    agentName: string;
    agentDescription?: string;
  },
) {
  const llmSettings = createLlmSettingsStore(db);
  const defaults = await llmSettings.getResolvedDefaults();

  return {
    name: input.agentName.trim(),
    description: input.agentDescription?.trim(),
    modelProfileId: defaults.primaryProfile.profileId,
    omModelProfileId: defaults.omProfile.profileId,
  };
}
