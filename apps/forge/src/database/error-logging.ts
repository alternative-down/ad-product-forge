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
 * ─── Related issues ───────────────────────────────────────────────────────
 *
 *   - #5485: this format spec (documentation + guard test)
 *   - #5483: PR that introduced the helper and migrated webhooks/store.ts
 *   - #5468: broader rollout of `withDbErrorLogging` to 7 store files
 *            (BLOCKED on this spec being documented first)
 */

import { errorMsg } from '../agents/error-formatting';
import { forgeDebug } from '@forge-runtime/core';

/**
 * Wraps a DB operation with consistent error logging.
 *
 * On success: returns the operation's result.
 * On failure: logs via forgeDebug (matching the previous try/catch format) and re-throws.
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
 * @throws whatever params.fn() throws, after logging
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
  context: Record<string, unknown>;
  fn: () => T | PromiseLike<T>;
}): Promise<T> {
  try {
    return await params.fn();
  } catch (err) {
    forgeDebug({
      scope: params.scope,
      level: 'error',
      message: `${params.op} DB ${params.verb} failed`,
      context: { ...params.context, error: errorMsg(err) },
    });
    throw err;
  }
}
