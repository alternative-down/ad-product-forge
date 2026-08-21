import { describe, expect, it } from 'vitest';
import { AgentLoaderConfigMissingError } from './agent-loader.errors';

describe('AgentLoaderConfigMissingError', () => {
  it('preserves verbatim message', () => {
    const err = new AgentLoaderConfigMissingError('llmProfile');
    expect(err).toBeInstanceOf(AgentLoaderConfigMissingError);
    expect(err.name).toBe('AgentLoaderConfigMissingError');
    expect(err.code).toBe('AGENT_LOADER_CONFIG_MISSING');
    expect(err.configKey).toBe('llmProfile');
    expect(err.message).toBe('Agent loader config missing: llmProfile');
  });
});
