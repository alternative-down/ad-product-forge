import type { Database } from '../database/index';
import { createLlmSettingsStore } from '../llm/settings-store';

export async function buildHiredAgentProfile(db: Database, input: {
  agentName: string;
  agentDescription?: string;
}) {
  const llmSettings = createLlmSettingsStore(db);
  const defaults = await llmSettings.getResolvedDefaults();

  return {
    name: input.agentName.trim(),
    description: input.agentDescription?.trim(),
    modelProfileId: defaults.primaryProfile.profileId,
    omModelProfileId: defaults.omProfile.profileId,
  };
}
