import { describe, expect, test } from 'vitest';
import {
  CoolifyEnvBulkUpdateMissingKeyError,
  CoolifyHealthProbeError,
  CoolifyVersionProbeError,
  CoolifyVersionShaMismatchError,
} from './errors';

// ── Pattern L D51 #6502 batch 13: typed-Error class tests ──
// Unit tests for coolify/manager.ts throw-site replacements.

describe('CoolifyHealthProbeError', () => {
  test('preserves HTTP status', () => {
    const err = new CoolifyHealthProbeError(503);
    expect(err.name).toBe('CoolifyHealthProbeError');
    expect(err.code).toBe('COOLIFY_HEALTH_PROBE');
    expect(err.status).toBe(503);
    expect(err.message).toBe('Health probe returned HTTP 503');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CoolifyHealthProbeError);
  });

  test('preserves status 500', () => {
    const err = new CoolifyHealthProbeError(500);
    expect(err.status).toBe(500);
    expect(err.message).toBe('Health probe returned HTTP 500');
  });
});

describe('CoolifyVersionProbeError', () => {
  test('preserves HTTP status', () => {
    const err = new CoolifyVersionProbeError(500);
    expect(err.name).toBe('CoolifyVersionProbeError');
    expect(err.code).toBe('COOLIFY_VERSION_PROBE');
    expect(err.status).toBe(500);
    expect(err.message).toBe('Version probe returned HTTP 500');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CoolifyVersionProbeError);
  });

  test('preserves status 502', () => {
    const err = new CoolifyVersionProbeError(502);
    expect(err.status).toBe(502);
    expect(err.message).toBe('Version probe returned HTTP 502');
  });
});

describe('CoolifyVersionShaMismatchError', () => {
  test('preserves actual and expected sha', () => {
    const err = new CoolifyVersionShaMismatchError('actual-sha', 'expected-sha');
    expect(err.name).toBe('CoolifyVersionShaMismatchError');
    expect(err.code).toBe('COOLIFY_VERSION_SHA_MISMATCH');
    expect(err.actualSha).toBe('actual-sha');
    expect(err.expectedSha).toBe('expected-sha');
    expect(err.message).toBe(
      'x-forge-version header "actual-sha" does not match expected sha "expected-sha"',
    );
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CoolifyVersionShaMismatchError);
  });

  test('handles null actualSha (header missing)', () => {
    const err = new CoolifyVersionShaMismatchError(null, 'expected-sha');
    expect(err.actualSha).toBe(null);
    expect(err.message).toBe(
      'x-forge-version header "null" does not match expected sha "expected-sha"',
    );
  });

  test('handles undefined actualSha', () => {
    const err = new CoolifyVersionShaMismatchError(undefined, 'expected-sha');
    expect(err.actualSha).toBe(undefined);
    expect(err.message).toBe(
      'x-forge-version header "null" does not match expected sha "expected-sha"',
    );
  });
});

describe('CoolifyEnvBulkUpdateMissingKeyError', () => {
  test('preserves env key', () => {
    const err = new CoolifyEnvBulkUpdateMissingKeyError('MY_KEY');
    expect(err.name).toBe('CoolifyEnvBulkUpdateMissingKeyError');
    expect(err.code).toBe('COOLIFY_ENV_BULK_UPDATE_MISSING_KEY');
    expect(err.envKey).toBe('MY_KEY');
    expect(err.message).toBe('Coolify API did not return env MY_KEY after bulk update');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(CoolifyEnvBulkUpdateMissingKeyError);
  });
});
