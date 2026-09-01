import { describe, expect, it } from 'vitest';
import { SystemIntegrationsUnknownProviderTypeError } from './store.errors';

describe('SystemIntegrationsUnknownProviderTypeError', () => {
  it('preserves verbatim message', () => {
    const err = new SystemIntegrationsUnknownProviderTypeError();
    expect(err).toBeInstanceOf(SystemIntegrationsUnknownProviderTypeError);
    expect(err.name).toBe('SystemIntegrationsUnknownProviderTypeError');
    expect(err.code).toBe('SYSTEM_INTEGRATIONS_UNKNOWN_PROVIDER_TYPE');
    expect(err.message).toBe('Unknown integration provider type');
  });
});
