/**
 * Typed Error classes for bundled-workspace-skills.ts.
 *
 * Replaces raw `throw new Error(...)` at L36, L48, L59, L87, L136 of
 * apps/forge/src/agents/bundled-workspace-skills.ts. Each throw has a
 * distinct message format, so we use 5 individual classes with `readonly`
 * context fields. Downstream consumers can use `err instanceof XError`
 * for fine-grained handling.
 *
 * Pattern L #6502 batch 8 (D51 cycle 25+).
 */

export class BundledSkillsMarkerNotFoundError extends Error {
  readonly code = 'BUNDLED_SKILLS_MARKER_NOT_FOUND';
  readonly start: string;

  constructor(start: string) {
    super(`skills/github-api/SKILL.md not found above ${start} (walked 5 levels)`);
    this.name = 'BundledSkillsMarkerNotFoundError';
    this.start = start;
  }
}

export class BundledSkillMissingFrontmatterError extends Error {
  readonly code = 'BUNDLED_SKILL_MISSING_FRONTMATTER';

  constructor() {
    super('Bundled skill is missing YAML frontmatter.');
    this.name = 'BundledSkillMissingFrontmatterError';
  }
}

export class BundledSkillFrontmatterNotClosedError extends Error {
  readonly code = 'BUNDLED_SKILL_FRONTMATTER_NOT_CLOSED';

  constructor() {
    super('Bundled skill frontmatter is not closed.');
    this.name = 'BundledSkillFrontmatterNotClosedError';
  }
}

export class BundledSkillFrontmatterMissingNameError extends Error {
  readonly code = 'BUNDLED_SKILL_FRONTMATTER_MISSING_NAME';

  constructor() {
    super('Bundled skill frontmatter is missing name.');
    this.name = 'BundledSkillFrontmatterMissingNameError';
  }
}

export class BundledSkillSourceNotFoundError extends Error {
  readonly code = 'BUNDLED_SKILL_SOURCE_NOT_FOUND';
  readonly sourceDirectoryName: string;

  constructor(sourceDirectoryName: string) {
    super(`Bundled skill source not found for ${sourceDirectoryName}`);
    this.name = 'BundledSkillSourceNotFoundError';
    this.sourceDirectoryName = sourceDirectoryName;
  }
}
