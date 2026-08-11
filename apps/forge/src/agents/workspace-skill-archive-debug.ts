import { forgeDebug } from '@forge-runtime/core';

/**
 * Module-local debug helper for agents/workspace-skill-archive.ts.
 * Bakes in scope=workspace-skills so call sites cannot typo the scope string.
 *
 * Pattern: L#NN-YYY v4 (single-scope helper extraction).
 *   - 5 forgeDebug call-sites in workspace-skill-archive.ts all use scope=workspace-skills
 *
 * L#NN-50 #50 LOG RETENTION discipline (codified):
 *   - Spread context fields to TOP-LEVEL of forgeDebug call, NOT nested in context
 *   - Preserves any future top-level fields (skillsRoot, entryPath, targetPath)
 *     so log correlation continues to work
 *   - Caller passes metadata as positional context arg
 *
 * Usage:
 *   workspaceSkillArchiveDebug('error', 'Failed to write archive entry', { entryPath, targetPath });
 */
export function workspaceSkillArchiveDebug(
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  context?: Record<string, unknown>,
): void {
  forgeDebug({
    scope: 'workspace-skills',
    level,
    message,
    ...context,
  });
}
