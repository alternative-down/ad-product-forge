import { describe, expect, test } from 'vitest';
import {
  hasToolPermission,
  isToolCapabilityId,
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

describe('isToolCapabilityId', () => {
  test('returns true for valid tool IDs', () => {
    expect(isToolCapabilityId('list_contacts')).toBe(true);
    expect(isToolCapabilityId('send_message')).toBe(true);
    expect(isToolCapabilityId('hire-internal-agent')).toBe(true);
    expect(isToolCapabilityId('terminate-internal-agent')).toBe(true);
    expect(isToolCapabilityId('minimax_tts')).toBe(true);
  });

  test('returns false for arbitrary string', () => {
    expect(isToolCapabilityId('some_arbitrary_tool')).toBe(false);
  });

  test('returns false for empty string', () => {
    expect(isToolCapabilityId('')).toBe(false);
  });

  test('returns false for partial match', () => {
    expect(isToolCapabilityId('list_contact')).toBe(false);
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