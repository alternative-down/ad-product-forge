import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for communication/internal-chat-service-helpers.ts.
 * Bakes in scope=internal-chat-service-helpers so call sites cannot typo the
 * scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 4 forgeDebug call-sites in internal-chat-service-helpers.ts all use
 *     scope=internal-chat-service-helpers
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *
 * Usage:
 *   internalChatServiceHelpersDebug('warn', 'getRequiredExternalAccount: not found', { accountId });
 */
export const internalChatServiceHelpersDebug = (
  level: 'warn',
  message: string,
  context?: Record<string, unknown>,
): void => {
  forgeDebug({
    scope: 'internal-chat-service-helpers',
    level,
    message,
    ...context,
  });
};
