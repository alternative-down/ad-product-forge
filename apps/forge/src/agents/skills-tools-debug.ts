import { forgeDebug } from '@forge-runtime/core';

/**
 * Single-scope debug helper for the skills-tools domain.
 *
 * Centralizes forgeDebug calls in apps/forge/src/agents/skills-tools.ts
 * so the scope string cannot be typo-d at the call sites, and so the
 * level/message/context shape is consistent across the file.
 *
 * Pattern reference: L#NN-YYY v4 (single-scope helper extraction).
 *
 * @param level - forgeDebug log level (warn or error for this domain).
 * @param message - human-readable message for the log entry.
 * @param context - optional structured fields to attach. Per L#NN-50
 *   LOG RETENTION discipline the fields are spread to TOP-LEVEL of the
 *   forgeDebug call (NOT nested inside a context object) so they are
 *   visible as first-class log fields downstream.
 */
export function skillsToolsDebug(
  level: 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'skills-tools',
    level,
    message,
    ...context,
  });
}