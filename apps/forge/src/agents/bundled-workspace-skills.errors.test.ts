import { describe, expect, it } from 'vitest';

import {
  BundledSkillFrontmatterMissingNameError,
  BundledSkillFrontmatterNotClosedError,
  BundledSkillMissingFrontmatterError,
  BundledSkillSourceNotFoundError,
  BundledSkillsMarkerNotFoundError,
} from './bundled-workspace-skills.errors';

describe('BundledSkillsMarkerNotFoundError', () => {
  it('preserves start param + message format', () => {
    const err = new BundledSkillsMarkerNotFoundError('/tmp/agents');
    expect(err).toBeInstanceOf(BundledSkillsMarkerNotFoundError);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('BundledSkillsMarkerNotFoundError');
    expect(err.code).toBe('BUNDLED_SKILLS_MARKER_NOT_FOUND');
    expect(err.start).toBe('/tmp/agents');
    expect(err.message).toBe(
      'skills/github-api/SKILL.md not found above /tmp/agents (walked 5 levels)',
    );
  });
});

describe('BundledSkillMissingFrontmatterError', () => {
  it('instanceof + name + code + message discrimination', () => {
    const err = new BundledSkillMissingFrontmatterError();
    expect(err).toBeInstanceOf(BundledSkillMissingFrontmatterError);
    expect(err.name).toBe('BundledSkillMissingFrontmatterError');
    expect(err.code).toBe('BUNDLED_SKILL_MISSING_FRONTMATTER');
    expect(err.message).toBe('Bundled skill is missing YAML frontmatter.');
  });
});

describe('BundledSkillFrontmatterNotClosedError', () => {
  it('instanceof + name + code + message discrimination', () => {
    const err = new BundledSkillFrontmatterNotClosedError();
    expect(err).toBeInstanceOf(BundledSkillFrontmatterNotClosedError);
    expect(err.name).toBe('BundledSkillFrontmatterNotClosedError');
    expect(err.code).toBe('BUNDLED_SKILL_FRONTMATTER_NOT_CLOSED');
    expect(err.message).toBe('Bundled skill frontmatter is not closed.');
  });
});

describe('BundledSkillFrontmatterMissingNameError', () => {
  it('instanceof + name + code + message discrimination', () => {
    const err = new BundledSkillFrontmatterMissingNameError();
    expect(err).toBeInstanceOf(BundledSkillFrontmatterMissingNameError);
    expect(err.name).toBe('BundledSkillFrontmatterMissingNameError');
    expect(err.code).toBe('BUNDLED_SKILL_FRONTMATTER_MISSING_NAME');
    expect(err.message).toBe('Bundled skill frontmatter is missing name.');
  });
});

describe('BundledSkillSourceNotFoundError', () => {
  it('preserves sourceDirectoryName + message format', () => {
    const err = new BundledSkillSourceNotFoundError('github-api');
    expect(err).toBeInstanceOf(BundledSkillSourceNotFoundError);
    expect(err.name).toBe('BundledSkillSourceNotFoundError');
    expect(err.code).toBe('BUNDLED_SKILL_SOURCE_NOT_FOUND');
    expect(err.sourceDirectoryName).toBe('github-api');
    expect(err.message).toBe('Bundled skill source not found for github-api');
  });
});
