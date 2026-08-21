/**
 * Typed Error subclasses for the agents/ltm/recall/orchestrator module (Pattern L, D52 #6502 batch 34).
 */
export class LtmRecallMissingMemorySettingsError extends Error {
  readonly code = 'LTM_RECALL_MISSING_MEMORY_SETTINGS' as const;
  constructor() {
    super('LTM recall requires runtime memory settings');
    this.name = 'LtmRecallMissingMemorySettingsError';
  }
}
