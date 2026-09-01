/**
 * Unit tests for agents/skills-shared/index.ts.
 * Pure file/text utilities — parseSkillMetadata has no I/O dependencies.
 * countSkillFiles excluded (requires live fs.readdir mocking with complex hoisting).
 * Zero prior coverage.
 */
import { describe, expect, it } from 'vitest';
import { parseSkillMetadata } from './index';

// ─── parseSkillMetadata ───────────────────────────────────────────────────────

describe('parseSkillMetadata', () => {
  it('returns empty object when no frontmatter', () => {
    expect(parseSkillMetadata('const foo = "bar";')).toEqual({});
  });

  it('returns empty object when frontmatter is incomplete', () => {
    expect(parseSkillMetadata('---\ndescription: "Test"\nNot closed')).toEqual({});
  });

  it('returns empty object when frontmatter start but no end marker', () => {
    expect(parseSkillMetadata('---\ndescription: "Test"\ncontent here')).toEqual({});
  });

  it('extracts description from frontmatter', () => {
    const result = parseSkillMetadata(
      '---\ndescription: "Build payment integrations"\n---\nSome content',
    );
    expect(result.description).toBe('Build payment integrations');
  });

  it('extracts description without surrounding quotes', () => {
    const result = parseSkillMetadata('---\ndescription: My Skill Description\n---\nContent');
    expect(result.description).toBe('My Skill Description');
  });

  it('extracts description with single quotes', () => {
    const result = parseSkillMetadata("---\ndescription: 'My Skill'\n---\nContent");
    expect(result.description).toBe('My Skill');
  });

  it('ignores lines without colon separator', () => {
    const result = parseSkillMetadata(
      '---\ndescription: "Test"\nunknown-line-without-colon\n---\nContent',
    );
    expect(result.description).toBe('Test');
  });

  it('returns empty object when description key has no value', () => {
    const result = parseSkillMetadata('---\ndescription:\n---\nContent');
    expect(result.description).toBeUndefined();
  });

  it('handles frontmatter with multiple keys', () => {
    const result = parseSkillMetadata(
      '---\nname: my-skill\ndescription: "Test desc"\nversion: "1.0"\n---\nContent',
    );
    expect(result.description).toBe('Test desc');
  });

  it('returns empty object for content with leading whitespace before frontmatter', () => {
    const result = parseSkillMetadata('  ---\n  description: "Test"\n  ---\nContent');
    expect(result.description).toBeUndefined();
  });

  it('returns empty object for empty string', () => {
    expect(parseSkillMetadata('')).toEqual({});
  });

  it('returns empty object when description value is empty after colon', () => {
    const result = parseSkillMetadata('---\ndescription:\n---\nContent');
    expect(result.description).toBeUndefined();
  });

  it('strips double-quoted values', () => {
    const result = parseSkillMetadata('---\ndescription: "Hello World"\n---\nContent');
    expect(result.description).toBe('Hello World');
  });

  it('strips single-quoted values', () => {
    const result = parseSkillMetadata("---\ndescription: 'Hello World'\n---\nContent");
    expect(result.description).toBe('Hello World');
  });

  it('ignores non-description keys', () => {
    const result = parseSkillMetadata(
      '---\nname: skill\ncategory: tools\ndescription: "My desc"\n---\nContent',
    );
    expect(result.description).toBe('My desc');
  });
});
