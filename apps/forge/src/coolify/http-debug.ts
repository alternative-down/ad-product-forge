import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for coolify/http.ts.
 * Bakes in scope=coolify so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 4 forgeDebug call-sites in coolify/http.ts all use scope=coolify
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *
 * Usage:
 *   coolifyHttpDebug('error', 'requestJson: fetch failed', { method, path, error: errorMsg(err) });
 */
export const coolifyHttpDebug = (
  level: 'error',
  message: string,
  context?: Record<string, unknown>,
): void => {
  forgeDebug({
    scope: 'coolify',
    level,
    message,
    ...context,
  });
};
