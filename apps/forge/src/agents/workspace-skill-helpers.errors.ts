/**
 * Typed Error subclasses for the agents/workspace-skill-helpers module (Pattern L, D52 #6502 batch 34).
 */
export class InvalidSkillArchiveEntryError extends Error {
  readonly code = 'INVALID_SKILL_ARCHIVE_ENTRY' as const;
  readonly entryPath: string;
  constructor(entryPath: string) {
    super(`Invalid skill archive entry: ${entryPath}`);
    this.name = 'InvalidSkillArchiveEntryError';
    this.entryPath = entryPath;
  }
}
