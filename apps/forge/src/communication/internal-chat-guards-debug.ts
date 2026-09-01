import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for communication/internal-chat-guards.ts.
 * Bakes in scope=internal-chat-guards so call sites cannot typo the
 * scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 4 forgeDebug call-sites in internal-chat-guards.ts all use
 *     scope=internal-chat-guards
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *
 * Usage:
 *   internalChatGuardsDebug('warn', 'requireConversation: not found', { conversationId });
 */
export const internalChatGuardsDebug = (
  level: 'warn',
  message: string,
  context?: Record<string, unknown>,
): void => {
  forgeDebug({
    scope: 'internal-chat-guards',
    level,
    message,
    ...context,
  });
};