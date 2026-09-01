import { describe, expect, test } from 'vitest';
import { WorkspaceSkillInvalidNameError } from './workspace-skills.errors';

// ── Pattern L D52 #6502 batch workspace-skills: typed-Error class tests ──
// Unit tests for agents/workspace-skills.ts throw-site replacements.
// Message strings preserved verbatim for backward compatibility.

describe('WorkspaceSkillInvalidNameError', () => {
  test('preserves verbatim message and stored skillName', () => {
    const err = new WorkspaceSkillInvalidNameError('BadName!');
    expect(err.name).toBe('WorkspaceSkillInvalidNameError');
    expect(err.code).toBe('WORKSPACE_SKILL_INVALID_NAME');
    expect(err.skillName).toBe('BadName!');
    expect(err.message).toBe('Invalid skill name: BadName!');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(WorkspaceSkillInvalidNameError);
  });

  test('handles empty skillName string', () => {
    const err = new WorkspaceSkillInvalidNameError('');
    expect(err.skillName).toBe('');
    expect(err.message).toBe('Invalid skill name: ');
  });

  test('handles skillName with shell-injection-style characters', () => {
    const err = new WorkspaceSkillInvalidNameError('../../etc/passwd');
    expect(err.skillName).toBe('../../etc/passwd');
    expect(err.message).toBe('Invalid skill name: ../../etc/passwd');
  });
});
