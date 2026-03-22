import type { Database } from '../database/index';
import { createLlmSettingsStore } from '../llm/settings-store';

export async function buildHiredAgentProfile(db: Database, input: {
  requestedFunction: string;
}) {
  const requestedFunction = input.requestedFunction.trim();
  const llmSettings = createLlmSettingsStore(db);
  const defaults = await llmSettings.getResolvedDefaults();

  return {
    name: requestedFunction,
    description: `Internal collaborator responsible for ${requestedFunction}.`,
    model: defaults.primaryProfile.modelKey,
    modelProfileId: defaults.primaryProfile.profileId,
    omModel: defaults.omProfile.modelKey,
    omModelProfileId: defaults.omProfile.profileId,
  };
}
