import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for admin/read-model/agents-detail.ts.
 * Bakes in scope='admin-read-model' so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 7 forgeDebug call-sites in admin/read-model/agents-detail.ts all use scope='admin-read-model'
 *   - This helper collapses the scope repetition while preserving level + message + context
 *
 * Usage:
 *   adminReadModelDebug('info', 'listAgentContracts started');
 *   adminReadModelDebug('error', 'listAgentContracts failed', { agentId, error: errorMsg(err) });
 */
export function adminReadModelDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'admin-read-model',
    level,
    message,
    context,
  });
}
