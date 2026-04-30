import { describe, expect, it } from 'vitest';
import {
  forgeCustomToolIds,
  forgeCapabilityIds,
  hasToolPermission,
  isToolCapabilityId,
  normalizeToolPermissionIds,
  type ForgeCustomToolId,
} from './catalog';

describe('forgeCustomToolIds', () => {
  it('contains expected tool IDs', () => {
    expect(forgeCustomToolIds).toContain('list_contacts');
    expect(forgeCustomToolIds).toContain('send_message');
    expect(forgeCustomToolIds).toContain('hire-internal-agent');
    expect(forgeCustomToolIds).toContain('terminate-internal-agent');
  });

  it('has 30 entries', () => {
    expect(forgeCustomToolIds.length).toBe(30);
  });

  it('forgeCapabilityIds is a copy of forgeCustomToolIds', () => {
    // Same content, not same reference
    expect(forgeCapabilityIds).toEqual(forgeCustomToolIds);
    expect(forgeCapabilityIds.length).toBe(forgeCustomToolIds.length);
    expect(forgeCapabilityIds).not.toBe(forgeCustomToolIds);
  });
});

describe('hasToolPermission', () => {
  it('returns true when allowedToolIds is null', () => {
    expect(hasToolPermission(null, 'send_message')).toBe(true);
  });

  it('returns true when allowedToolIds is undefined', () => {
    expect(hasToolPermission(undefined, 'send_message')).toBe(true);
  });

  it('returns false when allowedToolIds is an empty Set', () => {
    // Empty Set means nothing is allowed — returns false, not true
    expect(hasToolPermission(new Set(), 'send_message')).toBe(false);
  });

  it('returns true when toolId is in the allowed set', () => {
    const allowed = new Set(['send_message', 'list_contacts']);
    expect(hasToolPermission(allowed, 'send_message')).toBe(true);
  });

  it('returns false when toolId is NOT in the allowed set', () => {
    const allowed = new Set(['list_contacts']);
    expect(hasToolPermission(allowed, 'send_message')).toBe(false);
  });

  it('handles Set with many entries', () => {
    const allowed = new Set(forgeCustomToolIds);
    expect(hasToolPermission(allowed, 'terminate-internal-agent')).toBe(true);
  });
});

describe('isToolCapabilityId', () => {
  it('returns true for a known tool ID', () => {
    expect(isToolCapabilityId('send_message')).toBe(true);
  });

  it('returns true for first tool ID in the list', () => {
    expect(isToolCapabilityId('list_contacts')).toBe(true);
  });

  it('returns false for an unknown string', () => {
    expect(isToolCapabilityId('unknown_tool')).toBe(false);
  });

  it('returns false for a partial match', () => {
    expect(isToolCapabilityId('send_message_extra')).toBe(false);
  });

  it('acts as a type predicate (TypeScript narrowing)', () => {
    const id: string = 'send_message';
    if (isToolCapabilityId(id)) {
      const _: ForgeCustomToolId = id;
      expect(_).toBe('send_message');
    }
  });
});

describe('normalizeToolPermissionIds', () => {
  it('removes duplicates', () => {
    const result = normalizeToolPermissionIds(['a', 'b', 'a', 'c']);
    expect(result).toEqual(['a', 'b', 'c']);
  });

  it('sorts alphabetically', () => {
    const result = normalizeToolPermissionIds(['z', 'a', 'm', 'b']);
    expect(result).toEqual(['a', 'b', 'm', 'z']);
  });

  it('returns empty array for empty input', () => {
    expect(normalizeToolPermissionIds([])).toEqual([]);
  });

  it('handles single element', () => {
    expect(normalizeToolPermissionIds(['tool_x'])).toEqual(['tool_x']);
  });

  it('handles all unique already-sorted input', () => {
    const input = ['a', 'b', 'c'];
    const result = normalizeToolPermissionIds(input);
    expect(result).toEqual(['a', 'b', 'c']);
    // Original should not be mutated
    expect(input).toEqual(['a', 'b', 'c']);
  });
});
