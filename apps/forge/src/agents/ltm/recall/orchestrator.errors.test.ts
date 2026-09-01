import { describe, expect, it } from 'vitest';
import { LtmRecallMissingMemorySettingsError } from './orchestrator.errors';

describe('LtmRecallMissingMemorySettingsError', () => {
  it('preserves verbatim message', () => {
    const err = new LtmRecallMissingMemorySettingsError();
    expect(err).toBeInstanceOf(LtmRecallMissingMemorySettingsError);
    expect(err.name).toBe('LtmRecallMissingMemorySettingsError');
    expect(err.code).toBe('LTM_RECALL_MISSING_MEMORY_SETTINGS');
    expect(err.message).toBe('LTM recall requires runtime memory settings');
  });
});
