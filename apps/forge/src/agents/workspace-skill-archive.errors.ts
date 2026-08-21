/**
 * Typed Error subclasses for the agents/workspace-skill-archive module (Pattern L, D51 #6502).
 *
 * Replaces 2 raw `throw new Error(...)` calls in workspace-skill-archive.ts with 2 typed
 * Error subclasses so consumers can use `err instanceof XError`. See #6502.
 *
 * Migration impact: 2 literal `throw new Error(...)` calls in
 * apps/forge/src/agents/workspace-skill-archive.ts collapse to 2 typed Error classes.
 * Message format preserved verbatim for backward compatibility with existing tests.
 */

export class WorkspaceSkillArchiveInvalidEntryError extends Error {
  readonly code = 'WORKSPACE_SKILL_ARCHIVE_INVALID_ENTRY' as const;
  readonly entryPath: string;
  constructor(entryPath: string) {
    super(`Invalid skill archive entry: ${entryPath}`);
    this.name = 'WorkspaceSkillArchiveInvalidEntryError';
    this.entryPath = entryPath;
  }
}

export class WorkspaceSkillArchiveEmptyArchiveError extends Error {
  readonly code = 'WORKSPACE_SKILL_ARCHIVE_EMPTY_ARCHIVE' as const;
  constructor() {
    super('Skill archive did not contain any files');
    this.name = 'WorkspaceSkillArchiveEmptyArchiveError';
  }
}
