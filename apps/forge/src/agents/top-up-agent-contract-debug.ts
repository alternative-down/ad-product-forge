import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for agents/top-up-agent-contract.ts.
 * Bakes in scope=top-up-agent-contract so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 5 forgeDebug call-sites in top-up-agent-contract.ts all use scope=top-up-agent-contract
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *
 * Usage:
 *   topUpAgentContractDebug('error', 'Failed to find active contract', { error: errorMsg(err) });
 */
export function topUpAgentContractDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'top-up-agent-contract',
    level,
    message,
    ...context,
  });
}
