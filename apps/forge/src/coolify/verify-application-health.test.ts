/**
 * Unit tests for verifyApplicationHealth — extracted from coolify/manager.ts.
 *
 * Covers the three phases of the deploy verification gate:
 *   Phase 1 — status (Coolify-side)
 *   Phase 2 — health (App-side)
 *   Phase 3 — version (App-side, conditional)
 *
 * Existing coverage for the original function lives in coolify/manager.test.ts
 * and continues to pass via the re-export from manager.ts. This file covers
 * the new module's contract independently.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  verifyApplicationHealth,
  type DeployVerificationResult,
  type VerifyApplicationHealthDeps,
} from './verify-application-health';

// retryWithBackoff uses real delays (initialMs: 1000, multiplier: 2 => up to 15s).
// pollUntil polls up to 60 attempts at 1000ms intervals => up to 60s.
// Increase default timeout from 5s to 30s for this test file.
vi.setConfig({ testTimeout: 30_000 });

describe('verifyApplicationHealth', () => {
  let mockGetApplication: ReturnType<typeof vi.fn>;
  let deps: VerifyApplicationHealthDeps;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    mockGetApplication = vi.fn();
    deps = {
      getApplication: mockGetApplication as unknown as VerifyApplicationHealthDeps['getApplication'],
    };
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetchOnce(response: Partial<Response>): void {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(response as Response) as unknown as typeof fetch;
  }

  it('returns verified-success when status, health, and version all pass', async () => {
    mockGetApplication.mockResolvedValue({ status: 'running', fqdn: 'https://app.example.com' });
    // retryWithBackoff retries up to 4 times — provide always-success response
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'x-forge-version': 'expected-sha' }),
    }) as unknown as typeof fetch;

    const result: DeployVerificationResult = await verifyApplicationHealth(
      deps,
      { applicationUuid: 'uuid-1', expectedSha: 'expected-sha' },
    );

    expect(result.status).toBe('verified-success');
    if (result.status === 'verified-success') {
      expect(result.sha).toBe('expected-sha');
      expect(typeof result.verifiedAt).toBe('string');
    }
  });

  it('returns verified-success with null sha when expectedSha is omitted', async () => {
    mockGetApplication.mockResolvedValue({ status: 'running', fqdn: 'https://app.example.com' });
    mockFetchOnce({ ok: true, status: 200, headers: new Headers() });

    const result = await verifyApplicationHealth(deps, { applicationUuid: 'uuid-2' });

    expect(result.status).toBe('verified-success');
    if (result.status === 'verified-success') {
      expect(result.sha).toBeNull();
    }
  });

  it('returns verified-failure on Phase 1 (status) when getApplication throws', async () => {
    mockGetApplication.mockRejectedValue(new Error('network down'));

    const result = await verifyApplicationHealth(deps, { applicationUuid: 'uuid-3' });

    expect(result).toEqual({
      status: 'verified-failure',
      phase: 'status',
      error: expect.stringContaining('network down'),
    });
  });

  it('returns verified-failure on Phase 2 (health) when fqdn is null', async () => {
    mockGetApplication.mockResolvedValue({ status: 'running', fqdn: null });

    const result = await verifyApplicationHealth(deps, { applicationUuid: 'uuid-4' });

    expect(result).toEqual({
      status: 'verified-failure',
      phase: 'health',
      error: 'Application has no fqdn configured',
    });
  });

  it('returns verified-failure on Phase 2 (health) when health endpoint returns non-OK', async () => {
    mockGetApplication.mockResolvedValue({ status: 'running', fqdn: 'https://app.example.com' });
    // retryWithBackoff with maxRetries=3 means 4 attempts total; mock all to fail with non-OK
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 503, headers: new Headers() }) as unknown as typeof fetch;

    const result = await verifyApplicationHealth(deps, { applicationUuid: 'uuid-5' });

    expect(result.status).toBe('verified-failure');
    if (result.status === 'verified-failure') {
      expect(result.phase).toBe('health');
    }
  });

  it('returns verified-failure on Phase 3 (version) when sha mismatches', async () => {
    mockGetApplication.mockResolvedValue({ status: 'running', fqdn: 'https://app.example.com' });
    // First call (Phase 2 health) succeeds, all subsequent calls (Phase 3 retries) mismatch
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'x-forge-version': 'wrong-sha' }),
      }) as unknown as typeof fetch;

    const result = await verifyApplicationHealth(deps, {
      applicationUuid: 'uuid-6',
      expectedSha: 'expected-sha',
    });

    expect(result.status).toBe('verified-failure');
    if (result.status === 'verified-failure') {
      expect(result.phase).toBe('version');
      expect(result.error).toContain('does not match');
    }
  });

  it('skips Phase 3 when expectedSha is undefined', async () => {
    mockGetApplication.mockResolvedValue({ status: 'running', fqdn: 'https://app.example.com' });
    mockFetchOnce({ ok: true, status: 200, headers: new Headers() });

    const result = await verifyApplicationHealth(deps, { applicationUuid: 'uuid-7' });

    expect(result.status).toBe('verified-success');
    // Only one fetch call (Phase 2 health), no Phase 3 call
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('polls for status until running (Phase 1 polling)', async () => {
    // First 3 calls return non-running, 4th returns running
    mockGetApplication
      .mockResolvedValueOnce({ status: 'starting', fqdn: 'https://app.example.com' })
      .mockResolvedValueOnce({ status: 'starting', fqdn: 'https://app.example.com' })
      .mockResolvedValueOnce({ status: 'starting', fqdn: 'https://app.example.com' })
      .mockResolvedValue({ status: 'running', fqdn: 'https://app.example.com' });
    mockFetchOnce({ ok: true, status: 200, headers: new Headers() });

    const result = await verifyApplicationHealth(deps, { applicationUuid: 'uuid-8' });

    expect(result.status).toBe('verified-success');
    expect(mockGetApplication).toHaveBeenCalledTimes(4);
  });
});
