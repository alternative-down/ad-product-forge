import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for terminate-agent.ts.
 * Bakes in scope='terminate-agent' so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 9 forgeDebug call-sites in terminate-agent.ts all use scope='terminate-agent'
 *   - This helper collapses the scope repetition while preserving level + message + context
 *
 * Usage:
 *   terminateInternalAgentDebug('error', 'terminateAgent DB read failed', { agentId, error: errorMsg(err) });
 */
export function terminateInternalAgentDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'terminate-agent',
    level,
    message,
    context,
  });
}
