import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for database/migrate.ts.
 * Bakes in scope='migrations' so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 7 forgeDebug call-sites in database/migrate.ts all use scope='migrations'
 *   - This helper collapses the scope repetition while preserving level + message + context
 *
 * Usage:
 *   migrationsDebug('info', 'Running migrations');
 *   migrationsDebug('error', 'Migration failed', { error: errorMsg(err) });
 */
export function migrationsDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'migrations',
    level,
    message,
    context,
  });
}
