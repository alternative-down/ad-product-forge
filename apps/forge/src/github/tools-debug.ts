import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for apps/forge/src/github/tools.ts.
 * Bakes in scope=tools:github so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 SEPARATE-FILE (single-scope helper extraction).
 *   - 2 forgeDebug call-sites in tools.ts use scope=tools:github
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *
 * Usage:
 *   githubToolsDebug('info', 'get_github_git_credentials called', { repositoryName });
 */
export const githubToolsDebug = (
  level: 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void => {
  forgeDebug({
    scope: 'tools:github',
    level,
    message,
    ...context,
  });
};
