import { describe, expect, test } from 'vitest';
import {
  hasToolPermission,
  normalizeToolPermissionIds,
  forgeCustomToolIds,
} from './catalog';

describe('hasToolPermission', () => {
  test('returns true when allowedToolIds is null', () => {
    expect(hasToolPermission(null, 'list_contacts')).toBe(true);
  });

  test('returns true when allowedToolIds is undefined', () => {
    expect(hasToolPermission(undefined, 'list_contacts')).toBe(true);
  });

  test('returns false when toolId is not in allowedToolIds', () => {
    const allowed = new Set(['list_contacts']);
    expect(hasToolPermission(allowed, 'send_message')).toBe(false);
  });
});


describe('normalizeToolPermissionIds', () => {
  test('removes duplicates', () => {
    const result = normalizeToolPermissionIds(['a', 'b', 'a', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  test('sorts alphabetically', () => {
    const result = normalizeToolPermissionIds(['z', 'a', 'm', 'b']);
    expect(result).toEqual(['a', 'b', 'm', 'z']);
  });

  test('returns empty array for empty input', () => {
    expect(normalizeToolPermissionIds([])).toEqual([]);
  });

  test('handles single element', () => {
    expect(normalizeToolPermissionIds(['only'])).toEqual(['only']);
  });
});

describe('forgeCustomToolIds', () => {
  test('contains all expected tool IDs', () => {
    expect(forgeCustomToolIds).toContain('list_contacts');
    expect(forgeCustomToolIds).toContain('send_message');
    expect(forgeCustomToolIds).toContain('hire-internal-agent');
    expect(forgeCustomToolIds).toContain('terminate-internal-agent');
    expect(forgeCustomToolIds).toContain('minimax_tts');
    expect(forgeCustomToolIds).toContain('minimax_image');
    expect(forgeCustomToolIds).toContain('get_github_git_credentials');
  });

  test('does not contain arbitrary tool IDs', () => {
    expect(forgeCustomToolIds).not.toContain('arbitrary_tool');
    expect(forgeCustomToolIds).not.toContain('workspace_execute_command');
  });

  test('has unique values only', () => {
    const unique = new Set(forgeCustomToolIds);
    expect(unique.size).toBe(forgeCustomToolIds.length);
  });
});