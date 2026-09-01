import { describe, expect, test } from 'vitest';
import {
  CoolifyProviderConfigMissingIntegrationError,
  CoolifyProviderConfigMissingWildcardDomainError,
  CoolifyProviderConfigResolutionError,
} from './errors';

// ── Pattern L D51 #6502 batch 18: typed-Error class tests ──
// Unit tests for coolify/provider-config.ts throw-site replacements.
// Message strings preserved verbatim for backward compatibility with
// provider-config.test.ts string-based assertions.

describe('CoolifyProviderConfigMissingIntegrationError', () => {
  test('preserves verbatim message for missing integration case', () => {
    const err = new CoolifyProviderConfigMissingIntegrationError();
    expect(err.name).toBe('CoolifyProviderConfigMissingIntegrationError');
    expect(err.code).toBe('COOLIFY_PROVIDER_CONFIG_MISSING_INTEGRATION');
    expect(err.message).toBe(
      'Coolify integration requires a configured admin connection in system integrations',
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CoolifyProviderConfigMissingIntegrationError);
  });
});

describe('CoolifyProviderConfigMissingWildcardDomainError', () => {
  test('preserves verbatim message for missing wildcard domain case', () => {
    const err = new CoolifyProviderConfigMissingWildcardDomainError();
    expect(err.name).toBe('CoolifyProviderConfigMissingWildcardDomainError');
    expect(err.code).toBe('COOLIFY_PROVIDER_CONFIG_MISSING_WILDCARD_DOMAIN');
    expect(err.message).toBe(
      'Coolify integration could not determine a wildcard domain from the server configuration',
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CoolifyProviderConfigMissingWildcardDomainError);
  });
});

describe('CoolifyProviderConfigResolutionError', () => {
  test('preserves verbatim message and stored errorMessage', () => {
    const err = new CoolifyProviderConfigResolutionError('boom');
    expect(err.name).toBe('CoolifyProviderConfigResolutionError');
    expect(err.code).toBe('COOLIFY_PROVIDER_CONFIG_RESOLUTION');
    expect(err.errorMessage).toBe('boom');
    expect(err.message).toBe('Failed to resolve Coolify applications base domain: boom');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CoolifyProviderConfigResolutionError);
  });

  test('handles empty errorMessage string', () => {
    const err = new CoolifyProviderConfigResolutionError('');
    expect(err.errorMessage).toBe('');
    expect(err.message).toBe('Failed to resolve Coolify applications base domain: ');
  });
});
