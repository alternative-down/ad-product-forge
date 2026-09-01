/**
 * Shared forgeDebug helper for admin/read-model/*-helpers.ts files.
 *
 * Bakes the scope constant 'admin-read-model' so call sites cannot typo
 * the scope. Follows the L#NN-YYY v4 single-scope helper extraction
 * pattern (codified across the team, N=10+ applications).
 *
 * Context fields are spread to the TOP-LEVEL of the forgeDebug call (NOT
 * nested under a `context` key) per L#NN-50 #50 LOG RETENTION discipline,
 * so the values appear as first-class structured fields in the log sink.
 *
 * Note: this is a SHARED debug helper across multiple thematic files
 * (helpers-memory-formatting.ts + helpers-schedule-crypto.ts). The strict
 * L#NN-YYY v4 module-local pattern would split this further, but the
 * shared scope and small blast radius justify a single helper.
 */
import { forgeDebug } from '@forge-runtime/core';

export function adminDebug(
  level: 'debug' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({ scope: 'admin-read-model', level, message, context });
}
