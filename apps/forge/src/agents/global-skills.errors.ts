/**
 * Typed Error subclasses for the agents/global-skills module (Pattern L, D50 #6502 batch 3).
 *
 * Replaces 8 raw `throw new Error(...)` calls in global-skills.ts with typed Error
 * subclasses so consumers can use `err instanceof XError` instead of parsing
 * human-readable messages. See #6502.
 *
 * Pattern reference: apps/forge/src/schedules/errors.ts (D49 #6522),
 * apps/forge/src/minimax/errors.ts (D50 #6502 batch 1 by Varek).
 *
 * Migration impact: 8 literal `throw new Error(...)` calls in
 * apps/forge/src/agents/global-skills.ts collapse to 5 typed Error classes.
 * Message format is preserved for backward compatibility with existing tests.
 */

export class InvalidSkillNameError extends Error {
  readonly code = 'INVALID_SKILL_NAME' as const;
  readonly skillName: string;
  constructor(skillName: string) {
    super(`Invalid skill name: ${skillName}`);
    this.name = 'InvalidSkillNameError';
    this.skillName = skillName;
  }
}

export class BundledSkillNameReservedError extends Error {
  readonly code = 'BUNDLED_SKILL_NAME_RESERVED' as const;
  readonly skillName: string;
  constructor(skillName: string) {
    super(`Skill name is reserved by a bundled skill: ${skillName}`);
    this.name = 'BundledSkillNameReservedError';
    this.skillName = skillName;
  }
}

export class InvalidSkillArchiveEntryError extends Error {
  readonly code = 'INVALID_SKILL_ARCHIVE_ENTRY' as const;
  readonly entryPath: string;
  constructor(entryPath: string) {
    super(`Invalid skill archive entry: ${entryPath}`);
    this.name = 'InvalidSkillArchiveEntryError';
    this.entryPath = entryPath;
  }
}

export class EmptySkillArchiveError extends Error {
  readonly code = 'EMPTY_SKILL_ARCHIVE' as const;
  constructor() {
    super('Skill archive did not contain any files');
    this.name = 'EmptySkillArchiveError';
  }
}

export class GlobalSkillNotFoundError extends Error {
  readonly code = 'GLOBAL_SKILL_NOT_FOUND' as const;
  readonly skillName: string;
  constructor(skillName: string) {
    super(`Global skill not found: ${skillName}`);
    this.name = 'GlobalSkillNotFoundError';
    this.skillName = skillName;
  }
}
