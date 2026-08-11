import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for agents/hire-agent.ts.
 * Bakes in scope='hire-agent' so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 7 forgeDebug call-sites in agents/hire-agent.ts all use scope='hire-agent'
 *   - This helper collapses the scope repetition while preserving level + message + context
 *
 * Usage:
 *   hireAgentDebug('info', 'Hire flow started');
 *   hireAgentDebug('error', 'Rollback failed', { agentId, error: errorMsg(err) });
 */
export function hireAgentDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'hire-agent',
    level,
    message,
    context,
  });
}
