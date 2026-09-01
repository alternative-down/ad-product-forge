/**
 * tool-error-wrapper.ts
 *
 * Tool error logging helper for LLM-facing tool wrappers.
 *
 * Canonical location for `withToolErrorLogging` and `ToolResult<T>`. This file
 * was moved from `apps/forge/src/capabilities/tools/error-wrapper.ts` to
 * `@forge-runtime/core` in #5889 so the helper is available to package-level
 * tool implementations (e.g. `communication-tools.ts` Phase 11 of #5809).
 *
 * Tools across the capabilities/ namespace repeat the same try/catch +
 * forgeDebug + return {valid:false, error, hint} pattern around every
 * execute() body. This file provides a single helper that captures the
 * pattern, unifying:
 *
 *   - Error logging format (scope, op, error message)
 *   - Error return shape (valid=false, error, hint)
 *   - Success return shape (valid=true, data)
 *
 * No external state — pure function wrapper.
 *
 * ─── Canonical return shape (ToolResult<T>) ─────────────────────────────────
 *
 *   {
 *     valid: true,
 *     data: T,                    // original tool result
 *   }
 *
 *   - or -
 *
 *   {
 *     valid: false,
 *     error: string,              // formatted error message
 *     hint: string,               // tool-specific recovery hint
 *   }
 *
 * Callers must check `valid` first, then access `data` or `error`/`hint`.
 *
 * ─── Why this matters (drift prevention) ────────────────────────────────────
 *
 * Pre-#5809 tool wrappers had TWO inconsistent success shapes:
 *   - Some returned raw results (e.g. list_agent_roles → array of roles)
 *   - Some returned wrapped results (e.g. manage_agent_role → {valid:true, ...result})
 *
 * LLMs receiving these tool results had to learn two patterns. Helper enforces
 * a single discriminated-union shape across all tools, making downstream
 * parsers/dashboards uniform.
 *
 * ─── Back-compat ────────────────────────────────────────────────────────────
 *
 * `apps/forge/src/capabilities/tools/error-wrapper.ts` remains as a thin
 * re-export shim so all 10 existing import sites in apps continue to work
 * without churn. New code SHOULD import directly from `@forge-runtime/core`.
 *
 * ─── Related issues ────────────────────────────────────────────────────────
 *
 *   - #5809: this helper + Phase 1-10 rollout (32 catches, 8 files)
 *   - #5889: moved to @forge-runtime/core in this PR
 *   - #5887: Phase 11 (consumes this from package location)
 *   - #5483, #5468: withDbErrorLogging precedent (DB-throw pattern, L#NN-50 #8)
 *   - #5512 / PR #5806: withDbErrorLogging Phase 2 in agent-loader-data
 */

import { errorMsg } from './error-formatting.js';
import { forgeDebug } from './debug.js';

/**
 * Discriminated union returned by every LLM-facing tool wrapper.
 *
 * - On success: `{ valid: true, data: T }` where T is the tool's success type
 * - On failure: `{ valid: false, error: string, hint: string }`
 */
export type ToolResult<T> =
  | { valid: true; data: T }
  | { valid: false; error: string; hint: string };

/**
 * Wraps a tool execute body with consistent error logging + return shape.
 *
 * On success: returns `{ valid: true, data: <result> }`.
 * On failure: logs via forgeDebug with the canonical format and returns
 * `{ valid: false, error: <formatted>, hint: <hint> }`.
 *
 * The log message format is `<op> error` to match the legacy inline pattern.
 * Log consumers should be unchanged.
 *
 * @param params.scope - forgeDebug scope (e.g. 'tools:capabilities')
 * @param params.op - operation name (e.g. 'list_agent_roles')
 * @param params.hint - recovery hint shown to the caller (LLM) on failure
 * @param params.fn - the async tool execute body to run
 * @returns ToolResult<T> — discriminated union of success or failure
 *
 * @example
 *   execute: async () => withToolErrorLogging({
 *     scope: 'tools:capabilities',
 *     op: 'list_agent_roles',
 *     hint: 'Try again in a moment.',
 *     fn: async () => capabilities.listRoles(),
 *   }),
 */
export async function withToolErrorLogging<T>(params: {
  scope: string;
  op: string;
  hint: string;
  fn: () => Promise<T>;
}): Promise<ToolResult<T>> {
  try {
    const data = await params.fn();
    return { valid: true, data };
  } catch (error) {
    forgeDebug({
      scope: params.scope,
      level: 'error',
      message: `${params.op} error`,
      context: { error: errorMsg(error) },
    });
    return {
      valid: false,
      error: errorMsg(error),
      hint: params.hint,
    };
  }
}
