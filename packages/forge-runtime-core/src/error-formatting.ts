/**
 * error-formatting.ts
 *
 * Canonical location for `errorMsg` — extracts a human-readable string from
 * any error value (Error, string, or arbitrary unknown).
 *
 * This file was moved from `apps/forge/src/agents/error-formatting.ts` to
 * `@forge-runtime/core` in #5889 so the helper is available to package-level
 * code (e.g. `withToolErrorLogging` in `tool-error-wrapper.ts`, future
 * helpers in `communication-tools.ts` Phase 11 of #5809).
 *
 * ─── Why this matters ───────────────────────────────────────────────────────
 *
 * Every `forgeDebug` call that logs an error should use `errorMsg(err)`,
 * not raw `err.message`:
 *   - `errorMsg(err)` handles non-Error throws gracefully (String(err) fallback)
 *   - `err.message` throws on non-Error values
 *   - All files already importing `errorMsg` — check before adding new import
 *
 * Pattern (canonical):
 *   forgeDebug({ ..., context: { error: errorMsg(err) } });
 *
 * Anti-pattern:
 *   forgeDebug({ ..., context: { error: err.message } });  // throws on non-Error
 *
 * ─── Back-compat ────────────────────────────────────────────────────────────
 *
 * `apps/forge/src/agents/error-formatting.ts` retains its other utilities
 * (serializeUnknown, serializeError, formatAbsentErrorDetailValue, etc.) for
 * apps-specific absent-execution error formatting, and keeps a thin re-export
 * of `errorMsg` from `@forge-runtime/core` so all 18+ existing import sites
 * in apps continue to work without churn. New code SHOULD import directly
 * from `@forge-runtime/core`.
 *
 * ─── Related issues ────────────────────────────────────────────────────────
 *
 *   - #5889: moved `errorMsg` to @forge-runtime/core in this PR
 *   - #5887: Phase 11 (consumes this from package location)
 *   - #5809: L#NN-50 #12 family umbrella (uses errorMsg in forgeDebug calls)
 */

/**
 * Extracts a human-readable string from any error value.
 *
 * - Error instance → `err.message`
 * - string → the string itself
 * - other (number, object, null, etc.) → `JSON.stringify(value)`
 *
 * Use this anywhere a thrown value needs to be rendered into a log message
 * or a tool-result error field. Safe for non-Error throws.
 */
export function errorMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return JSON.stringify(err);
}
