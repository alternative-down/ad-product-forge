import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for init-agent-registry.ts.
 * Bakes in scope='init-agent-registry' so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 9 forgeDebug call-sites in init-agent-registry.ts all use scope='init-agent-registry'
 *   - This helper collapses the scope repetition while preserving level + message + context
 *
 * Usage:
 *   initAgentRegistryDebug('info', 'Migrations completed');
 *   initAgentRegistryDebug('error', 'Error initializing agent registry', { error: errorMsg(err) });
 */
export function initAgentRegistryDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'init-agent-registry',
    level,
    message,
    context,
  });
}
