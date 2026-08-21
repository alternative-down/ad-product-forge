/**
 * Tests for Pattern L typed Errors in coolify module (D52 #6628 batch 2).
 *
 * Each test verifies:
 *   1. The thrown error is an instanceof the typed Error class
 *   2. The error code matches the expected discriminator
 *   3. The message text is preserved verbatim for backward compatibility
 *   4. Domain fields are exposed on the error for downstream consumers
 *
 * See apps/forge/src/coolify/errors.ts.
 */

import { describe, expect, it } from 'vitest';

import {
  CoolifyEnvBulkUpdateMissingKeyError,
  CoolifyHealthProbeError,
  CoolifyHttpRequestError,
  CoolifyProviderConfigMissingIntegrationError,
  CoolifyProviderConfigMissingWildcardDomainError,
  CoolifyProviderConfigResolutionError,
  CoolifyVersionProbeError,
  CoolifyVersionShaMismatchError,
} from './errors';

describe('coolify/errors — Pattern L typed Errors (D52 #6628 batch 2)', () => {
  describe('CoolifyHealthProbeError', () => {
    it('preserves HTTP status', () => {
      const error = new CoolifyHealthProbeError(503);
      expect(error).toBeInstanceOf(CoolifyHealthProbeError);
      expect(error.code).toBe('COOLIFY_HEALTH_PROBE');
      expect(error.status).toBe(503);
      expect(error.message).toBe('Health probe returned HTTP 503');
    });

    it('preserves status 500', () => {
      const error = new CoolifyHealthProbeError(500);
      expect(error.status).toBe(500);
      expect(error.message).toBe('Health probe returned HTTP 500');
    });
  });

  describe('CoolifyVersionProbeError', () => {
    it('preserves HTTP status', () => {
      const error = new CoolifyVersionProbeError(500);
      expect(error).toBeInstanceOf(CoolifyVersionProbeError);
      expect(error.code).toBe('COOLIFY_VERSION_PROBE');
      expect(error.status).toBe(500);
      expect(error.message).toBe('Version probe returned HTTP 500');
    });

    it('preserves status 502', () => {
      const error = new CoolifyVersionProbeError(502);
      expect(error.status).toBe(502);
      expect(error.message).toBe('Version probe returned HTTP 502');
    });
  });

  describe('CoolifyVersionShaMismatchError', () => {
    it('preserves actual and expected sha strings', () => {
      const error = new CoolifyVersionShaMismatchError('actual-sha', 'expected-sha');
      expect(error).toBeInstanceOf(CoolifyVersionShaMismatchError);
      expect(error.code).toBe('COOLIFY_VERSION_SHA_MISMATCH');
      expect(error.actualSha).toBe('actual-sha');
      expect(error.expectedSha).toBe('expected-sha');
      expect(error.message).toBe(
        'x-forge-version header "actual-sha" does not match expected sha "expected-sha"',
      );
    });

    it('handles null actualSha', () => {
      const error = new CoolifyVersionShaMismatchError(null, 'expected-sha');
      expect(error.actualSha).toBeNull();
      expect(error.message).toBe(
        'x-forge-version header "null" does not match expected sha "expected-sha"',
      );
    });

    it('handles undefined actualSha', () => {
      const error = new CoolifyVersionShaMismatchError(undefined, 'expected-sha');
      expect(error.actualSha).toBeUndefined();
      expect(error.message).toBe(
        'x-forge-version header "null" does not match expected sha "expected-sha"',
      );
    });
  });

  describe('CoolifyEnvBulkUpdateMissingKeyError', () => {
    it('captures envKey and preserves verbatim message', () => {
      const error = new CoolifyEnvBulkUpdateMissingKeyError('MY_ENV_VAR');
      expect(error).toBeInstanceOf(CoolifyEnvBulkUpdateMissingKeyError);
      expect(error.code).toBe('COOLIFY_ENV_BULK_UPDATE_MISSING_KEY');
      expect(error.envKey).toBe('MY_ENV_VAR');
      expect(error.message).toBe(
        'Coolify API did not return env MY_ENV_VAR after bulk update',
      );
    });
  });

  describe('CoolifyProviderConfigMissingIntegrationError', () => {
    it('preserves verbatim message', () => {
      const error = new CoolifyProviderConfigMissingIntegrationError();
      expect(error).toBeInstanceOf(CoolifyProviderConfigMissingIntegrationError);
      expect(error.code).toBe('COOLIFY_PROVIDER_CONFIG_MISSING_INTEGRATION');
      expect(error.message).toBe(
        'Coolify integration requires a configured admin connection in system integrations',
      );
    });
  });

  describe('CoolifyProviderConfigMissingWildcardDomainError', () => {
    it('preserves verbatim message', () => {
      const error = new CoolifyProviderConfigMissingWildcardDomainError();
      expect(error).toBeInstanceOf(CoolifyProviderConfigMissingWildcardDomainError);
      expect(error.code).toBe('COOLIFY_PROVIDER_CONFIG_MISSING_WILDCARD_DOMAIN');
      expect(error.message).toBe(
        'Coolify integration could not determine a wildcard domain from the server configuration',
      );
    });
  });

  describe('CoolifyProviderConfigResolutionError', () => {
    it('captures errorMessage and preserves verbatim message', () => {
      const error = new CoolifyProviderConfigResolutionError('boom');
      expect(error).toBeInstanceOf(CoolifyProviderConfigResolutionError);
      expect(error.code).toBe('COOLIFY_PROVIDER_CONFIG_RESOLUTION');
      expect(error.errorMessage).toBe('boom');
      expect(error.message).toBe(
        'Failed to resolve Coolify applications base domain: boom',
      );
    });

    it('handles empty errorMessage string', () => {
      const error = new CoolifyProviderConfigResolutionError('');
      expect(error.errorMessage).toBe('');
      expect(error.message).toBe(
        'Failed to resolve Coolify applications base domain: ',
      );
    });
  });

  describe('CoolifyHttpRequestError', () => {
    it('captures method, path, status, and body for string body', () => {
      const error = new CoolifyHttpRequestError('GET', '/servers/uuid', 404, 'Not found');
      expect(error).toBeInstanceOf(CoolifyHttpRequestError);
      expect(error.code).toBe('COOLIFY_HTTP_REQUEST');
      expect(error.method).toBe('GET');
      expect(error.path).toBe('/servers/uuid');
      expect(error.status).toBe(404);
      expect(error.body).toBe('Not found');
      expect(error.message).toBe(
        'Coolify API GET /servers/uuid failed with 404: Not found',
      );
    });

    it('handles null body', () => {
      const error = new CoolifyHttpRequestError('GET', '/health', 503, null);
      expect(error.body).toBeNull();
      expect(error.status).toBe(503);
      expect(error.message).toBe('Coolify API GET /health failed with 503: null');
    });
  });
});
