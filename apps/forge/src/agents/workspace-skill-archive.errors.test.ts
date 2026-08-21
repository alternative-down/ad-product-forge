import { describe, expect, test } from 'vitest';

import {
  WorkspaceSkillArchiveEmptyArchiveError,
  WorkspaceSkillArchiveInvalidEntryError,
} from './workspace-skill-archive.errors';

describe('agents/workspace-skill-archive errors', () => {
  describe('WorkspaceSkillArchiveInvalidEntryError', () => {
    test('preserves verbatim message with entry path', () => {
      const err = new WorkspaceSkillArchiveInvalidEntryError('../escape.txt');
      expect(err).toBeInstanceOf(WorkspaceSkillArchiveInvalidEntryError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('WorkspaceSkillArchiveInvalidEntryError');
      expect(err.code).toBe('WORKSPACE_SKILL_ARCHIVE_INVALID_ENTRY');
      expect(err.entryPath).toBe('../escape.txt');
      expect(err.message).toBe('Invalid skill archive entry: ../escape.txt');
    });
  });

  describe('WorkspaceSkillArchiveEmptyArchiveError', () => {
    test('preserves verbatim message', () => {
      const err = new WorkspaceSkillArchiveEmptyArchiveError();
      expect(err).toBeInstanceOf(WorkspaceSkillArchiveEmptyArchiveError);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('WorkspaceSkillArchiveEmptyArchiveError');
      expect(err.code).toBe('WORKSPACE_SKILL_ARCHIVE_EMPTY_ARCHIVE');
      expect(err.message).toBe('Skill archive did not contain any files');
    });
  });
});
