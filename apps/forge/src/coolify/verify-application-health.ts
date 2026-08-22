/**
 * Tri-state deploy verification gate — extracted from coolify/manager.ts.
 *
 * Implements three sequential phases of a deploy verification gate:
 *   Phase 1 — status (Coolify-side): pollUntil(`getApplication -> status === "running"`, 60s)
 *   Phase 2 — health (App-side): retryWithBackoff(`HTTP GET {fqdn}/health -> 200 OK`, 3x)
 *   Phase 3 — version (App-side, conditional): retryWithBackoff(`HTTP GET {fqdn}/version -> x-forge-version header matches`, 3x)
 *
 * Catches the failure mode where Coolify reports "successfully deployed" but the
 * app is still returning 503 (startup crash, migration failure, upstream-pool
 * dead container). P0 #6315 root-cause follow-up; completes the 6-layer
 * Defense-in-Depth cascade (Issue #6337, implementation #6541).
 *
 * Polling and retry handle Coolify-side settling delays (30-60s typical).
 * Helpers in `coolify/polling-helpers.ts`. Pure-function style, typed options.
 *
 * Extracted from coolify/manager.ts in D53 cycle 2 (#6664, L#NN large-file
 * decomposition). Independent of the manager's other 26 methods, low-risk
 * extraction per L#NN-Pattern-L-Single-Concern-Decomposition.
 *
 * Reference pattern: `coolify/polling-helpers.ts` (164 LoC, Pattern L exemplar:
 * 6 typed errors, 213 tests, 0 raw throws).
 */

import { pollUntil, retryWithBackoff } from './polling-helpers';
import {
  CoolifyHealthProbeError,
  CoolifyVersionProbeError,
  CoolifyVersionShaMismatchError,
} from './errors';

/**
 * Result of the tri-state deploy verification gate.
 * Discriminated by `status`:
 *   - 'verified-success' — all phases passed (sha + verifiedAt populated)
 *   - 'verified-failure' — at least one phase failed (phase + error populated)
 *   - 'timeout' — overall timeout exceeded (phase + elapsed populated)
 */
export type DeployVerificationResult =
  | { status: 'verified-success'; sha: string | null; verifiedAt: string }
  | { status: 'verified-failure'; phase: 'status' | 'health' | 'version'; error: string }
  | { status: 'timeout'; phase: 'status' | 'health' | 'version'; elapsed: number };

/**
 * Minimal Coolify-side dependency surface for verifyApplicationHealth.
 * The only closure-bound dependency from the original factory was
 * `getApplication`, so we expose just that to keep this module's coupling
 * narrow. If future phases need additional Coolify-side helpers, add them here.
 */
export interface VerifyApplicationHealthDeps {
  getApplication: (
    applicationUuid: string,
  ) => Promise<{ status: string; fqdn: string | null }>;
}

export async function verifyApplicationHealth(
  deps: VerifyApplicationHealthDeps,
  input: { applicationUuid: string; expectedSha?: string },
): Promise<DeployVerificationResult> {
  const { getApplication } = deps;

  // Phase 1: Status check (Coolify-side) — single-shot first, then poll up to 60s
  let app: Awaited<ReturnType<typeof getApplication>>;
  try {
    app = await getApplication(input.applicationUuid);
  } catch (err) {
    return {
      status: 'verified-failure',
      phase: 'status',
      error: `getApplication failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (app.status !== 'running') {
    try {
      app = await pollUntil(
        async () => {
          const updated = await getApplication(input.applicationUuid);
          return updated.status === 'running' ? updated : null;
        },
        { maxAttempts: 60, intervalMs: 1000, backoffMultiplier: 1.5 },
      );
    } catch {
      // Polling exhausted — re-fetch to get the current status before reporting
      let finalApp = app;
      try {
        finalApp = await getApplication(input.applicationUuid);
      } catch {
        // Use last known status if re-fetch fails
      }
      return {
        status: 'verified-failure',
        phase: 'status',
        error: `Application status is "${finalApp.status ?? 'null'}", expected "running"`,
      };
    }
  }

  // Phase 2: Health probe (App-side) — retry 3x with exponential backoff
  if (app.fqdn == null) {
    return {
      status: 'verified-failure',
      phase: 'health',
      error: 'Application has no fqdn configured',
    };
  }

  const baseUrl = app.fqdn.replace(/\/$/, '');

  let _healthResponse: Response;
  try {
    _healthResponse = await retryWithBackoff(
      async () => {
        const response = await fetch(`${baseUrl}/health`);
        if (response.ok !== true) {
          throw new CoolifyHealthProbeError(response.status);
        }
        return response;
      },
      { maxRetries: 3, initialMs: 1000, multiplier: 2 },
    );
  } catch (err) {
    return {
      status: 'verified-failure',
      phase: 'health',
      error: err instanceof Error ? err.message : String(err),
    };
  }

  // Phase 3: Version verification (App-side, conditional) — retry 3x with exponential backoff
  if (input.expectedSha !== undefined) {
    let versionResponse: Response;
    try {
      versionResponse = await retryWithBackoff(
        async () => {
          const response = await fetch(`${baseUrl}/version`);
          if (response.ok !== true) {
            throw new CoolifyVersionProbeError(response.status);
          }
          const actualSha = response.headers.get('x-forge-version');
          if (actualSha !== input.expectedSha) {
            throw new CoolifyVersionShaMismatchError(actualSha ?? null, input.expectedSha!);
          }
          return response;
        },
        { maxRetries: 3, initialMs: 1000, multiplier: 2 },
      );
    } catch (err) {
      return {
        status: 'verified-failure',
        phase: 'version',
        error: err instanceof Error ? err.message : String(err),
      };
    }

    const actualSha = versionResponse.headers.get('x-forge-version');
    return {
      status: 'verified-success',
      sha: actualSha,
      verifiedAt: new Date().toISOString(),
    };
  }

  return {
    status: 'verified-success',
    sha: null,
    verifiedAt: new Date().toISOString(),
  };
}
