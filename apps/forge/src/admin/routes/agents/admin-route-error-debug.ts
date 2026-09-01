import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for admin/routes/agents/admin-route-error-helper.ts.
 * Bakes in scope=admin so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 1 forgeDebug call-site in admin-route-error-helper.ts uses scope=admin
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *
 * Usage:
 *   adminRouteErrorDebug('error', 'Admin route failed', { path, error: errorMsg(err) });
 */
export const adminRouteErrorDebug = (
  level: 'error' | 'warn',
  message: string,
  context?: Record<string, unknown>,
): void => {
  forgeDebug({
    scope: 'admin',
    level,
    message,
    ...context,
  });
};