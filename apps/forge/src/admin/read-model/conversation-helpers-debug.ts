/**
 * Module-local forgeDebug helper for admin/read-model/conversation-helpers.ts.
 *
 * Bakes the scope constant 'admin-read-model-conversation-helpers' so that
 * call sites cannot typo the scope. Follows the L#NN-YYY v4 single-scope
 * helper extraction pattern (codified across the team, N=10+ applications).
 *
 * Context fields are spread to the TOP-LEVEL of the forgeDebug call (NOT
 * nested under a `context` key) per L#NN-50 #50 LOG RETENTION discipline,
 * so the values appear as first-class structured fields in the log sink.
 */
import { forgeDebug } from '@forge-runtime/core';

export function conversationHelpersDebug(
  level: 'error',
  message: string,
  context: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'admin-read-model-conversation-helpers',
    level,
    message,
    ...context,
  });
}
