/**
 * Logger helpers for apps/forge/src/agents/ltm/recall.ts and other ltm-recall call sites.
 *
 * Centralizes the forgeDebug({scope: 'ltm-recall', ...}) call shape so the scope
 * string lives in exactly one place per scope. Prefer ltmRecallDebug() over raw
 * forgeDebug() at recall call sites: future scope renames touch one line here
 * instead of every call site in the file.
 *
 * L#NN-50 #50 LOG RETENTION discipline (D45 cycle 4/6):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *   - Matches the ltmDebug and agentRunnerDebug contracts (L#NN-YYY v3 SEPARATE-FILE)
 *   - Allows log consumers to filter/scope by individual context fields directly
 *
 * Pattern: L#NN-YYY v4 SEPARATE-FILE extraction (D45 cycle 6 — Triple-Fix Protocol v1 N=2).
 * Previously ltm-recall forgeDebug calls went through a local ltmRecallDebug helper
 * defined inside recall.ts (code smell — local helper shadowing). Extracted to this
 * separate file for consistency with ltmDebug in ../ltm-debug-helpers.ts.
 *
 * Usage:
 *   ltmRecallDebug('error', 'recall failed', { error: errorMsg(e) });
 *   ltmRecallDebug('warn', 'persistRecallSnapshot failed', {
 *     threadId, resourceId, error: errorMsg(e),
 *   });
 */
import { forgeDebug } from '@forge-runtime/core';

export type LtmRecallDebugLevel = 'debug' | 'info' | 'warn' | 'error';

export function ltmRecallDebug(
  level: LtmRecallDebugLevel,
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({ scope: 'ltm-recall', level, message, ...context });
}
