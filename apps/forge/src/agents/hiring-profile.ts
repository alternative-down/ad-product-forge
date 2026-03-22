import type { Database } from '../database/index.js';
import { createLlmSettingsStore } from '../llm/settings-store.js';

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
    omModel: defaults.omProfile.modelKey,
  };
}
