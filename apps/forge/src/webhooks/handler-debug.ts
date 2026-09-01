import { forgeDebug } from '@forge-runtime/core';

/**
 * Logger helper for apps/forge/src/webhooks/handler.ts.
 *
 * Centralizes the forgeDebug({scope: 'webhooks-handler', ...}) call shape so the
 * scope string lives in exactly one place per scope. Prefer webhooksHandlerDebug()
 * over raw forgeDebug() at handler call sites: future scope renames touch one line
 * here instead of every call site in the file.
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *   - Allows log consumers to filter/scope by individual context fields directly
 *   - Matches the ltmRecallDebug and queriesSchedulesManagerDebug contracts
 *
 * Pattern: L#NN-YYY v4 SEPARATE-FILE extraction (D46 cycle 10).
 *   - 4 webhooksHandlerDebug call-sites in handler.ts all use scope=webhooks-handler
 *   - Local helper inside handler.ts was a code smell (local helper shadowing)
 *
 * LHS PERMANENT N=4 trigger (D46 cycle 10 — webhooks/handler.ts):
 *   N=1: D45 #6458 cycle 6 (agents/ltm/recall/index-manager.ts)
 *   N=2: D45 #6461 cycle 7 (agents/workspace-skills.ts)
 *   N=3: D45 #6463 cycle 8 (schedules/manager/mutations.ts)
 *   N=4: D46 cycle 10 (webhooks/handler.ts) — pending PM-merge
 *
 * Usage:
 *   webhooksHandlerDebug('error', 'Route has no secret — misconfigured', { routeId, agentId: route.agentId });
 *   webhooksHandlerDebug('warn', 'Invalid signature', { routeId });
 *   webhooksHandlerDebug('info', 'Idempotent replay — skipping notification', { routeId, eventId: result.eventId });
 */
export function webhooksHandlerDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'webhooks-handler',
    level,
    message,
    ...context,
  });
}
