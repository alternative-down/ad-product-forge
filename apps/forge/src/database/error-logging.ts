/**
 * error-logging.ts
 *
 * Database error logging helpers for store modules.
 *
 * Stores across the codebase repeat the same try/catch + forgeDebug + throw
 * pattern around every DB operation. This file provides a single helper that
 * captures the pattern, keeping the store's business logic visible.
 *
 * No external state — pure function wrapper.
 *
 * ─── Canonical log format (Format A) ──────────────────────────────────────
 *
 * All DB error logs emitted by `withDbErrorLogging` follow this contract:
 *
 *   {
 *     scope: '<store-scope>',         // e.g. 'webhooks-store'
 *     level: 'error',
 *     message: '<op> DB <verb> failed',  // generic, NO inline error
 *     context: { ...callSiteFields, error: '<formatted error msg>' },
 *   }
 *
 *   - `message` is a stable, parseable summary suitable for dashboards/alerts
 *     that group by operation. It MUST NOT contain the error string.
 *   - `context.error` carries the formatted error string. The dashboard/parser
 *     should read the error from `context.error`, not `message`.
 *
 * This is the unified format introduced by PR #5483 (which migrated
 * `apps/forge/src/webhooks/store.ts` to the helper). 6 of 9 pre-existing
 * sites in that file already used this format; 3 used the legacy Format B
 * (error inlined in `message`). All 3 Format-B sites were converted to
 * Format A in the same PR.
 *
 * ─── Why this matters (silent dashboard breakage) ──────────────────────────
 *
 * A pre-#5483 log line for a Format-B site looked like:
 *   { message: 'getRoute DB read failed: SQLITE_BUSY: database is locked', ... }
 * The post-#5483 line is:
 *   { message: 'getRoute DB read failed', context: { error: 'SQLITE_BUSY: ...' } }
 * Any dashboard/parser that extracts the error string from `message`
 * (e.g., via regex `DB (read|write) failed: (.*)`) will silently break on
 * the Format-A log lines because `message` no longer carries the error.
 *
 * A static-analysis guard test in `error-logging.test.ts` enforces Format A
 * by scanning all `*store.ts` files and failing if any of them reverts to
 * Format B (`message` containing `errorMsg(err)`).
 *
 * ─── Silent-failure removal (issue #5984) ─────────────────────────────────
 *
 * Previously the helper accepted a `mode: 'throw' | 'return-null' |
 * 'return-empty-array'` parameter that allowed call-sites to silently
 * swallow DB errors and return a placeholder value. This was the root
 * cause of the silent-failure cluster (#5984 + #5975-#5978): read paths
 * that caught DB errors and returned `null`/`[]` made it impossible for
 * callers to distinguish "no record" from "DB is down".
 *
 * As of #5984, the helper ALWAYS re-throws after logging. Call-sites that
 * previously used `mode: 'return-null'` / `'return-empty-array'` must rely
 * on the underlying query's natural no-result contract (e.g., findFirst
 * returning undefined for "not found") and let DB errors propagate.
 *
 *   - For reads that should be silent on "not found" but loud on DB error,
 *     keep the type signature `Promise<T | null>` and only return null when
 *     the underlying query genuinely returned no row.
 *   - For reads that must guarantee a non-null row, use `findOrThrow` from
 *     `./find-or-throw` (issue #5469).
 *
 * ─── Related issues ───────────────────────────────────────────────────────
 *
 *   - #5485: this format spec (documentation + guard test)
 *   - #5483: PR that introduced the helper and migrated webhooks/store.ts
 *   - #5469: findOrThrow companion helper for "findFirst + log + throw"
 *   - #5984: SAF bundle — removed silent-failure modes from this helper
 *   - #5975/#5976/#5977/#5978: cluster of silent-failures this PR closed
 */

import { errorMsg } from '../agents/error-formatting';
import { forgeDebug } from '@forge-runtime/core';

/**
 * Wraps a DB operation with consistent error logging and re-throws on failure.
 *
 * Behavior:
 *   - On success: returns the operation's result unchanged.
 *   - On failure: logs via forgeDebug (Format A) and re-throws the original
 *     error. The error is NOT swallowed, NOT converted to null, NOT converted
 *     to an empty array — DB errors MUST propagate to the caller.
 *
 * The log message format is `${op} DB ${verb} failed` to match the legacy
 * inline pattern. Log consumers should be unchanged.
 *
 * @param params.scope - forgeDebug scope (e.g. 'webhooks-store')
 * @param params.op - operation name (e.g. 'createRoute')
 * @param params.verb - 'read' or 'write', used in the log message
 * @param params.context - structured fields added to the log context
 * @param params.fn - the async DB operation to run
 * @returns the result of params.fn()
 * @throws whatever params.fn() throws, after logging via forgeDebug
 *
 * @example
 *   await withDbErrorLogging({
 *     scope: 'webhooks-store',
 *     op: 'createRoute',
 *     verb: 'write',
 *     context: { agentId: input.agentId },
 *     fn: () => db.insert(webhookRoutes).values(route),
 *   });
 */
export async function withDbErrorLogging<T>(params: {
  scope: string;
  op: string;
  verb: 'read' | 'write';
  context?: Record<string, unknown>;
  fn: () => T | PromiseLike<T>;
}): Promise<T> {
  try {
    return await params.fn();
  } catch (err) {
    forgeDebug({
      scope: params.scope,
      level: 'error',
      message: `${params.op} DB ${params.verb} failed`,
      context: { ...(params.context ?? {}), error: errorMsg(err) },
    });
    throw err;
  }
}
