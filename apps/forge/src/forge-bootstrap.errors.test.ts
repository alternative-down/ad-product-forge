import { describe, expect, it } from 'vitest';
import { ForgeAdminApiKeyNotConfiguredError } from './forge-bootstrap.errors';

describe('ForgeAdminApiKeyNotConfiguredError', () => {
  it('preserves verbatim message', () => {
    const err = new ForgeAdminApiKeyNotConfiguredError();
    expect(err).toBeInstanceOf(ForgeAdminApiKeyNotConfiguredError);
    expect(err.name).toBe('ForgeAdminApiKeyNotConfiguredError');
    expect(err.code).toBe('FORGE_ADMIN_API_KEY_NOT_CONFIGURED');
    expect(err.message).toBe(
      'FORGE_ADMIN_API_KEY is not configured. Set it in your environment or set' +
        ' FORGE_ADMIN_ALLOW_INSECURE_LOCAL=true for local development only.'
    );
  });
});
