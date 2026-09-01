import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-scoped debug logger for migadu-manager.
 *
 * Centralizes the scope literal and forward of optional structured context.
 * Callers pass the level and message verbatim; the helper prepends the
 * migadu-manager scope so downstream log aggregation can filter by module.
 *
 * Behavior preserved versus the original inline forgeDebug call sites:
 *   - scope: 'migadu-manager' is fixed (was duplicated at every site)
 *   - context: optional structured call-site fields (not deep-copied)
 *   - all four log levels (debug/info/warn/error) forwarded verbatim
 */
export function migaduManagerDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  // The level parameter is preserved for API parity with the original inline
  // forgeDebug call sites; the underlying forgeDebug(scope, message, data?)
  // signature does not surface the level, so it is encoded into the message
  // prefix here to keep log output comparable with the pre-refactor format.
  const taggedMessage = '[' + level + '] ' + message;
  if (context !== undefined) {
    forgeDebug('migadu-manager', taggedMessage, context);
  } else {
    forgeDebug('migadu-manager', taggedMessage);
  }
}