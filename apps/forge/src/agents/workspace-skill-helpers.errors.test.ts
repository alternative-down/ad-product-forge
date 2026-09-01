import { describe, expect, it } from 'vitest';
import { InvalidSkillArchiveEntryError } from './workspace-skill-helpers.errors';

describe('InvalidSkillArchiveEntryError', () => {
  it('preserves verbatim message', () => {
    const err = new InvalidSkillArchiveEntryError('skills/bad.zip');
    expect(err).toBeInstanceOf(InvalidSkillArchiveEntryError);
    expect(err.name).toBe('InvalidSkillArchiveEntryError');
    expect(err.code).toBe('INVALID_SKILL_ARCHIVE_ENTRY');
    expect(err.entryPath).toBe('skills/bad.zip');
    expect(err.message).toBe('Invalid skill archive entry: skills/bad.zip');
  });
});
