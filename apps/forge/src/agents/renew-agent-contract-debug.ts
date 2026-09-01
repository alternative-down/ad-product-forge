import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for agents/renew-agent-contract.ts.
 * Bakes in scope=renew-agent-contract so call sites cannot typo the
 * scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 4 forgeDebug call-sites in renew-agent-contract.ts all use
 *     scope=renew-agent-contract and level=info
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *
 * Usage:
 *   renewAgentContractDebug('info', 'no-active-contract', { agentId });
 */
export const renewAgentContractDebug = (
  level: 'info',
  message: string,
  context?: Record<string, unknown>,
): void => {
  forgeDebug({
    scope: 'renew-agent-contract',
    level,
    message,
    ...context,
  });
};