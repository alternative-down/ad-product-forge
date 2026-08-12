import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for agents/global-skills.ts.
 * Bakes in scope=global-skills so call sites cannot typo the
 * scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 4 forgeDebug call-sites in global-skills.ts all use
 *     scope=global-skills (3 level=warn, 1 level=error)
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *
 * Usage:
 *   globalSkillsDebug('warn', 'loadGlobalSkill: archive empty', {});
 *   globalSkillsDebug('error', 'loadCustomSkills failed', { error: errorMsg(error) });
 */
export const globalSkillsDebug = (
  level: 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void => {
  forgeDebug({
    scope: 'global-skills',
    level,
    message,
    ...context,
  });
};