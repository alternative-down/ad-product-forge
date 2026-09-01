/**
 * GitHub App Ops — low-level GitHub App authentication and Octokit helpers.
 *
 * Part of #5318 — split createGitHubAppManager.
 *
 * Provides:
 * - getInstallationToken: get short-lived installation token from GitHub App
 *   (with circuit breaker + refresh: true to prevent cascade amplification)
 * - createGitHubApp: build the App instance for webhook delivery
 * - createInstallationOctokit: build Octokit for a specific installation
 */
import { App } from 'octokit';
import { createAppAuth } from '@octokit/auth-app';
import type { Octokit } from 'octokit';
import type { GitHubAppCredentials } from '../types';
import { errorMsg } from '../../agents/error-formatting';

export interface GitHubAppOps {
  getInstallationToken: (
    credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
  ) => Promise<{ token: string; expiresAt: string }>;
  createGitHubApp: (
    credentials: Extract<GitHubAppCredentials, { status: 'created' | 'active' }>,
  ) => App;
  createInstallationOctokit: (
    credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
  ) => Promise<Octokit>;
  /** Test hook to reset circuit breaker state. Not part of public API. */
  _resetCircuitBreakerForTesting?: () => void;
}

// ─── Circuit Breaker (cascade amplifier fix, #6799) ────────────────────────────
//
// Problem: when an installation is deleted, every getInstallationToken call
// returns 401 and Octokit caches the failure for ~1h, sustaining the cascade
// across many agent wake cycles.
//
// Fix:
// 1. Pass refresh: true to Octokit auth so it bypasses its internal cache.
// 2. Track failures per (appId, installationId). After 3 failures within
//    CIRCUIT_BREAKER_WINDOW_MS, open the circuit: subsequent calls throw
//    GitHubAppCircuitOpenError without hitting the network. This stops the
//    cascade from amplifying (each call would otherwise trigger a new
//    attempt + cache entry).
// 3. After CIRCUIT_BREAKER_COOLDOWN_MS, attempt a single retry (half-open).
//    If success, close the circuit. If failure, reopen.

const CIRCUIT_BREAKER_WINDOW_MS = 60_000;
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;

export class GitHubAppCircuitOpenError extends Error {
  constructor(public readonly appId: number, public readonly installationId: number) {
    super(
      `GitHub App circuit breaker is open for appId=${appId} installationId=${installationId} (too many recent failures). Cooldown in effect.`,
    );
    this.name = 'GitHubAppCircuitOpenError';
  }
}

interface CircuitState {
  failures: number;
  firstFailureAt: number;
  openedAt: number | null;
}

const circuitByKey = new Map<string, CircuitState>();

function circuitKey(appId: number, installationId: number): string {
  return `${appId}-${installationId}`;
}

function checkCircuit(appId: number, installationId: number): void {
  const key = circuitKey(appId, installationId);
  const state = circuitByKey.get(key);
  if (!state || state.openedAt === null) return;

  const elapsedSinceOpen = Date.now() - state.openedAt;
  if (elapsedSinceOpen >= CIRCUIT_BREAKER_COOLDOWN_MS) {
    // Half-open: allow one attempt. Do not clear state here — let recordSuccess
    // or recordFailure decide.
    return;
  }
  throw new GitHubAppCircuitOpenError(appId, installationId);
}

function recordSuccess(appId: number, installationId: number): void {
  circuitByKey.delete(circuitKey(appId, installationId));
}

function recordFailure(appId: number, installationId: number): void {
  const key = circuitKey(appId, installationId);
  const now = Date.now();
  const existing = circuitByKey.get(key);

  if (!existing || now - existing.firstFailureAt > CIRCUIT_BREAKER_WINDOW_MS) {
    circuitByKey.set(key, { failures: 1, firstFailureAt: now, openedAt: null });
    return;
  }

  const newFailures = existing.failures + 1;
  if (newFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    circuitByKey.set(key, {
      failures: newFailures,
      firstFailureAt: existing.firstFailureAt,
      openedAt: now,
    });
  } else {
    circuitByKey.set(key, {
      failures: newFailures,
      firstFailureAt: existing.firstFailureAt,
      openedAt: null,
    });
  }
}

export function createGitHubAppOps(): GitHubAppOps {
  async function getInstallationToken(
    credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
  ) {
    const { appId, installationId, privateKey } = credentials;

    // ── Pre-flight circuit check (no network call if open) ───────────────────
    checkCircuit(appId, installationId);

    const auth = createAppAuth({
      appId,
      privateKey,
      installationId,
    });

    let token: { token: string; expiresAt: string };
    try {
      // refresh: true bypasses Octokit's internal cache so we always hit GitHub
      // with a fresh POST /app/installations/{id}/access_tokens. This is the key
      // fix to break the existing cascade where Octokit was returning cached 401s.
      const result = await auth({ type: 'installation', refresh: true });
      token = {
        token: result.token,
        expiresAt: result.expiresAt,
      };
      recordSuccess(appId, installationId);
    } catch (error) {
      recordFailure(appId, installationId);
      throw new Error(
        `getInstallationToken failed for appId=${appId} installationId=${installationId}: ${errorMsg(error)}`,
      );
    }

    return token;
  }

  function createGitHubApp(
    credentials: Extract<GitHubAppCredentials, { status: 'created' | 'active' }>,
  ) {
    return new App({
      appId: credentials.appId,
      privateKey: credentials.privateKey,
      webhooks: {
        secret: credentials.webhookSecret,
      },
    });
  }

  async function createInstallationOctokit(
    credentials: Extract<GitHubAppCredentials, { status: 'active' }>,
  ) {
    const app = createGitHubApp(credentials);
    return await app.getInstallationOctokit(credentials.installationId);
  }

  return {
    getInstallationToken,
    createGitHubApp,
    createInstallationOctokit,
    _resetCircuitBreakerForTesting: () => circuitByKey.clear(),
  };
}
