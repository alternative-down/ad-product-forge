import { describe, expect, it } from 'vitest';
import { InternalAgentRegistryReloadConfigError } from './internal-agent-registry.errors';

describe('InternalAgentRegistryReloadConfigError', () => {
  it('preserves verbatim message', () => {
    const err = new InternalAgentRegistryReloadConfigError();
    expect(err).toBeInstanceOf(InternalAgentRegistryReloadConfigError);
    expect(err.name).toBe('InternalAgentRegistryReloadConfigError');
    expect(err.code).toBe('INTERNAL_AGENT_REGISTRY_RELOAD_CONFIG');
    expect(err.message).toBe('Agent loader config is not available for runtime reload');
  });
});
