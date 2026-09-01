import { describe, expect, test } from 'vitest';
import {
  InvalidSkillNameError,
  BundledSkillNameReservedError,
  InvalidSkillArchiveEntryError,
  EmptySkillArchiveError,
  GlobalSkillNotFoundError,
} from './global-skills.errors';

describe('agents/global-skills.errors', () => {
  describe('InvalidSkillNameError', () => {
    test('has expected name, code, and message', () => {
      const err = new InvalidSkillNameError('foo');
      expect(err.name).toBe('InvalidSkillNameError');
      expect(err.code).toBe('INVALID_SKILL_NAME');
      expect(err.message).toBe('Invalid skill name: foo');
      expect(err.skillName).toBe('foo');
    });

    test('is instanceof Error and self', () => {
      const err = new InvalidSkillNameError('foo');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(InvalidSkillNameError);
    });
  });

  describe('BundledSkillNameReservedError', () => {
    test('has expected name, code, and message', () => {
      const err = new BundledSkillNameReservedError('reserved-name');
      expect(err.name).toBe('BundledSkillNameReservedError');
      expect(err.code).toBe('BUNDLED_SKILL_NAME_RESERVED');
      expect(err.message).toBe('Skill name is reserved by a bundled skill: reserved-name');
      expect(err.skillName).toBe('reserved-name');
    });

    test('is instanceof Error and self', () => {
      const err = new BundledSkillNameReservedError('foo');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(BundledSkillNameReservedError);
    });
  });

  describe('InvalidSkillArchiveEntryError', () => {
    test('has expected name, code, and message', () => {
      const err = new InvalidSkillArchiveEntryError('/path/to/entry');
      expect(err.name).toBe('InvalidSkillArchiveEntryError');
      expect(err.code).toBe('INVALID_SKILL_ARCHIVE_ENTRY');
      expect(err.message).toBe('Invalid skill archive entry: /path/to/entry');
      expect(err.entryPath).toBe('/path/to/entry');
    });

    test('is instanceof Error and self', () => {
      const err = new InvalidSkillArchiveEntryError('/path');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(InvalidSkillArchiveEntryError);
    });
  });

  describe('EmptySkillArchiveError', () => {
    test('has expected name, code, and message', () => {
      const err = new EmptySkillArchiveError();
      expect(err.name).toBe('EmptySkillArchiveError');
      expect(err.code).toBe('EMPTY_SKILL_ARCHIVE');
      expect(err.message).toBe('Skill archive did not contain any files');
    });

    test('is instanceof Error and self', () => {
      const err = new EmptySkillArchiveError();
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(EmptySkillArchiveError);
    });
  });

  describe('GlobalSkillNotFoundError', () => {
    test('has expected name, code, and message', () => {
      const err = new GlobalSkillNotFoundError('missing-skill');
      expect(err.name).toBe('GlobalSkillNotFoundError');
      expect(err.code).toBe('GLOBAL_SKILL_NOT_FOUND');
      expect(err.message).toBe('Global skill not found: missing-skill');
      expect(err.skillName).toBe('missing-skill');
    });

    test('is instanceof Error and self', () => {
      const err = new GlobalSkillNotFoundError('foo');
      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(GlobalSkillNotFoundError);
    });
  });

  describe('instanceof discrimination', () => {
    test('can discriminate between different errors via instanceof', () => {
      const errA = new InvalidSkillNameError('foo');
      const errB = new GlobalSkillNotFoundError('foo');
      expect(errA).toBeInstanceOf(InvalidSkillNameError);
      expect(errA).not.toBeInstanceOf(GlobalSkillNotFoundError);
      expect(errB).toBeInstanceOf(GlobalSkillNotFoundError);
      expect(errB).not.toBeInstanceOf(InvalidSkillNameError);
    });
  });
});
