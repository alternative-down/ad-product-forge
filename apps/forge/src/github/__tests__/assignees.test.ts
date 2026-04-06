import { describe, it, expect } from 'vitest';

// Inline the normalizeAssignees function for testing
function normalizeAssignees(assignees?: string[]): string[] | undefined {
  if (!assignees || assignees.length === 0) {
    return undefined;
  }

  const gitHubAppPattern = /^[a-z0-9]+(-[a-z0-9]+)+$/;

  return assignees.map((assignee) => {
    if (assignee.endsWith('[bot]')) {
      return assignee;
    }
    if (gitHubAppPattern.test(assignee)) {
      return `${assignee}[bot]`;
    }
    return assignee;
  });
}

describe('normalizeAssignees', () => {
  it('should return undefined for undefined input', () => {
    expect(normalizeAssignees(undefined)).toBeUndefined();
  });

  it('should return undefined for empty array', () => {
    expect(normalizeAssignees([])).toBeUndefined();
  });

  it('should keep regular usernames unchanged', () => {
    const result = normalizeAssignees(['octocat', 'defunkt']);
    expect(result).toEqual(['octocat', 'defunkt']);
  });

  it('should append [bot] to kebab-case GitHub App accounts', () => {
    const result = normalizeAssignees(['architectron-the-scalabil-sykutp']);
    expect(result).toEqual(['architectron-the-scalabil-sykutp[bot]']);
  });

  it('should keep accounts already ending with [bot] unchanged', () => {
    const result = normalizeAssignees(['octocat[bot]', 'dependabot[bot]']);
    expect(result).toEqual(['octocat[bot]', 'dependabot[bot]']);
  });

  it('should handle mixed inputs', () => {
    const result = normalizeAssignees([
      'octocat',
      'architectron-the-scalabil-sykutp',
      'webflow-wizard-pixelia-l85akb',
      'dependabot[bot]',
    ]);
    expect(result).toEqual([
      'octocat',
      'architectron-the-scalabil-sykutp[bot]',
      'webflow-wizard-pixelia-l85akb[bot]',
      'dependabot[bot]',
    ]);
  });

  it('should handle single-segment strings as regular accounts', () => {
    const result = normalizeAssignees(['bot']);
    expect(result).toEqual(['bot']);
  });

  it('should handle two-segment kebab-case as GitHub App accounts', () => {
    const result = normalizeAssignees(['my-app-12345']);
    expect(result).toEqual(['my-app-12345[bot]']);
  });

  it('should handle numeric-only strings', () => {
    const result = normalizeAssignees(['12345']);
    expect(result).toEqual(['12345']);
  });

  it('should handle kebab-case with numbers throughout', () => {
    const result = normalizeAssignees(['app-name-123abc-xyz789']);
    expect(result).toEqual(['app-name-123abc-xyz789[bot]']);
  });
});
