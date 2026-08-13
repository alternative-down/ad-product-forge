import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for agents/bundled-workspace-skills.ts.
 * Bakes in scope=bundled-workspace-skills so call sites cannot typo the
 * scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 4 forgeDebug call-sites in bundled-workspace-skills.ts all use
 *     scope=bundled-workspace-skills (3 level=warn, 1 level=error)
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *   - Preserves any future top-level fields (skillFilePath, sourceDirectoryName)
 *     so log correlation continues to work
 *   - Caller passes metadata as positional context arg
 *
 * Usage:
 *   bundledWorkspaceSkillsDebug('warn', 'parseBundledSkillMeta: missing YAML frontmatter', {});
 *   bundledWorkspaceSkillsDebug('error', 'listBundledWorkspaceSkills: source not found', { skillFilePath, sourceDirectoryName });
 */
export function bundledWorkspaceSkillsDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'bundled-workspace-skills',
    level,
    message,
    ...context,
  });
}
