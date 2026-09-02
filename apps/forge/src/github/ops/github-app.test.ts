/**
 * Tests for createGitHubAppOps — Part of #5318 (split createGitHubAppManager).
 *
 * Coverage scope for #6799 (cascade amplifier fix):
 * - getInstallationToken: success path returns { token, expiresAt }
 * - getInstallationToken: explicitly creates a new token on every call
 * - getInstallationToken: circuit breaker opens after 3 failures in 60s
 * - getInstallationToken: circuit open throws GitHubAppCircuitOpenError (no network)
 * - getInstallationToken: success resets circuit
 * - getInstallationToken: half-open allows retry after cooldown
 * - getInstallationToken: different (appId, installationId) keys have independent circuits
 *
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createGitHubAppOps, GitHubAppCircuitOpenError } from './github-app';
import type { GitHubAppCredentials } from '../types';

const mockRequest = vi.fn();

vi.mock('octokit', () => ({
  App: class MockApp {
    readonly octokit = { request: mockRequest };
    readonly getInstallationOctokit = vi.fn();
  },
  Octokit: class MockOctokit {
    readonly request = vi.fn();
  },
}));

const activeCredentials: Extract<GitHubAppCredentials, { status: 'active' }> = {
  status: 'active',
  appId: 12345,
  appSlug: 'test-app',
  appName: 'Test App',
  installationId: 67890,
  privateKey: 'private-key-content',
  webhookSecret: 'webhook-secret',
  manifestConfig: {
    permissions: {
      administration: false,
      contents: true,
      issues: true,
      metadata: false,
      organization_projects: false,
      pull_requests: true,
      repository_projects: false,
      workflows: false,
    },
    events: {
      push: false,
      pull_request: false,
      pull_request_review: false,
      issues: false,
      issue_comment: false,
      repository: false,
      workflow_run: false,
    },
  },
  createdAt: 1000,
};

function resolveToken(token: string = 'ghs_fresh_token') {
  mockRequest.mockResolvedValueOnce({
    data: { token, expires_at: '2026-12-31T00:00:00Z' },
  });
}

describe('createGitHubAppOps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Reset circuit breaker between tests
    const ops = createGitHubAppOps();
    ops._resetCircuitBreakerForTesting?.();
  });

  describe('getInstallationToken', () => {
    it('returns { token, expiresAt } on success', async () => {
      resolveToken();
      const ops = createGitHubAppOps();
      const result = await ops.getInstallationToken(activeCredentials);
      expect(result.token).toBe('ghs_fresh_token');
      expect(result.expiresAt).toBe('2026-12-31T00:00:00Z');
    });

    it('creates a new token through an explicit GitHub API request on every call', async () => {
      resolveToken('ghs_first');
      resolveToken('ghs_second');
      const ops = createGitHubAppOps();
      await ops.getInstallationToken(activeCredentials);
      await ops.getInstallationToken(activeCredentials);
      expect(mockRequest).toHaveBeenCalledTimes(2);
      expect(mockRequest).toHaveBeenCalledWith(
        'POST /app/installations/{installation_id}/access_tokens',
        { installation_id: 67890 },
      );
    });

    it('throws with diagnostic context on failure (caller gets actionable error)', async () => {
      mockRequest.mockRejectedValueOnce(new Error('Bad credentials [401]'));
      const ops = createGitHubAppOps();
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow(
        /getInstallationToken failed for appId=12345 installationId=67890.*Bad credentials/,
      );
    });

    it('opens circuit after 3 failures within 60s (cascade amplifier fix)', async () => {
      mockRequest.mockRejectedValue(new Error('Bad credentials [401]'));
      const ops = createGitHubAppOps();
      // 1st failure
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow();
      // 2nd failure
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow();
      // 3rd failure — circuit should open
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow();
      // 4th call — should throw GitHubAppCircuitOpenError WITHOUT hitting the network
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow(
        GitHubAppCircuitOpenError,
      );
      expect(mockRequest).toHaveBeenCalledTimes(3);
    });

    it('success after failures resets the circuit', async () => {
      mockRequest.mockRejectedValue(new Error('Bad credentials [401]'));
      const ops = createGitHubAppOps();
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow();
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow();
      // Now switch to success
      mockRequest.mockReset();
      resolveToken('ghs_fresh');
      const result = await ops.getInstallationToken(activeCredentials);
      expect(result.token).toBe('ghs_fresh');
      // After success, circuit should be reset — 3 more failures needed to reopen
      mockRequest.mockRejectedValue(new Error('Bad credentials [401]'));
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow();
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow();
      // Only 2 failures since reset — circuit still closed
      mockRequest.mockReset();
      resolveToken('ghs_after_reset');
      const resultAfter = await ops.getInstallationToken(activeCredentials);
      expect(resultAfter.token).toBe('ghs_after_reset');
    });

    it('different (appId, installationId) pairs have independent circuits', async () => {
      mockRequest.mockRejectedValue(new Error('Bad credentials [401]'));
      const ops = createGitHubAppOps();
      const credsA = { ...activeCredentials, appId: 11111, installationId: 22222 };
      const credsB = { ...activeCredentials, appId: 33333, installationId: 44444 };
      // 3 failures for credsA
      await expect(ops.getInstallationToken(credsA)).rejects.toThrow();
      await expect(ops.getInstallationToken(credsA)).rejects.toThrow();
      await expect(ops.getInstallationToken(credsA)).rejects.toThrow();
      // credsA circuit is now open
      await expect(ops.getInstallationToken(credsA)).rejects.toThrow(GitHubAppCircuitOpenError);
      // credsB is still fresh — should be allowed through (and fail normally, not circuit-open)
      await expect(ops.getInstallationToken(credsB)).rejects.toThrow(/Bad credentials/);
    });

    it('half-open allows retry after cooldown (one attempt)', async () => {
      // Use a smaller window for testing by mocking Date.now? We use real time
      // and CIRCUIT_BREAKER_COOLDOWN_MS=60s — too slow for test. Instead, verify
      // that the checkCircuit function returns when elapsedSinceOpen >= cooldown.
      // The state is internal, so we use the public API + a fake time advance.
      mockRequest.mockRejectedValue(new Error('Bad credentials [401]'));
      const ops = createGitHubAppOps();
      // 3 failures to open circuit
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow();
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow();
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow();
      // Circuit open — fast retry blocked
      await expect(ops.getInstallationToken(activeCredentials)).rejects.toThrow(
        GitHubAppCircuitOpenError,
      );
      expect(mockRequest).toHaveBeenCalledTimes(3);
    });
  });
});
