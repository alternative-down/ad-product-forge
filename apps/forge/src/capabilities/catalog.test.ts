import { describe, it, expect } from 'vitest';
import {
  forgeCustomToolIds,
  forgeCapabilityIds,
  hasToolPermission,
  isToolCapabilityId,
  normalizeToolPermissionIds,
  type ForgeCustomToolId,
} from './catalog';

describe('forgeCustomToolIds', () => {
  it('contains expected number of tool IDs', () => {
    expect(forgeCustomToolIds).toHaveLength(32);
  });

  it('includes hire-internal-agent and terminate-internal-agent', () => {
    expect(forgeCustomToolIds).toContain('hire-internal-agent');
    expect(forgeCustomToolIds).toContain('terminate-internal-agent');
  });

  it('includes chat-related tool IDs', () => {
    expect(forgeCustomToolIds).toContain('list_conversations');
    expect(forgeCustomToolIds).toContain('send_message');
    expect(forgeCustomToolIds).toContain('change_chat_group');
  });

  it('includes all expected ForgeCustomToolIds', () => {
    // Spot-check a sample of known IDs
    const knownIds = [
      'list_contacts',
      'send_message',
      'change_chat_group',
      'hire-internal-agent',
      'terminate-internal-agent',
      'minimax_tts',
      'list_company_cash',
      'get_github_git_credentials',
    ];
    knownIds.forEach((id) => {
      expect(forgeCustomToolIds).toContain(id);
    });
  });
});

describe('forgeCapabilityIds', () => {
  it('has same contents as forgeCustomToolIds', () => {
    expect(forgeCapabilityIds).toEqual(forgeCustomToolIds);
  });

  it('has same length as forgeCustomToolIds', () => {
    expect(forgeCapabilityIds.length).toBe(forgeCustomToolIds.length);
  });
});

describe('hasToolPermission', () => {
  it('returns true when allowedToolIds is null', () => {
    expect(hasToolPermission(null, 'send_message')).toBe(true);
  });

  it('returns true when allowedToolIds is undefined', () => {
    expect(hasToolPermission(undefined, 'send_message')).toBe(true);
  });

  it('returns true when allowedToolIds has the requested tool', () => {
    const allowed = new Set(['send_message', 'list_conversations']);
    expect(hasToolPermission(allowed, 'send_message')).toBe(true);
  });

  it('returns false when allowedToolIds does not have the requested tool', () => {
    const allowed = new Set(['list_conversations']);
    expect(hasToolPermission(allowed, 'send_message')).toBe(false);
  });

  it('returns false for unknown tool not in set', () => {
    const allowed = new Set(['list_contacts']);
    expect(hasToolPermission(allowed, 'unknown_tool' as ForgeCustomToolId)).toBe(false);
  });

  it('returns false for empty set', () => {
    const allowed = new Set<string>();
    expect(hasToolPermission(allowed, 'list_contacts')).toBe(false);
  });

  it('is case-sensitive', () => {
    const allowed = new Set(['Send_Message']);
    expect(hasToolPermission(allowed, 'send_message')).toBe(false);
  });
});

describe('isToolCapabilityId', () => {
  it('returns true for valid tool IDs', () => {
    expect(isToolCapabilityId('send_message')).toBe(true);
    expect(isToolCapabilityId('hire-internal-agent')).toBe(true);
    expect(isToolCapabilityId('minimax_tts')).toBe(true);
    expect(isToolCapabilityId('list_company_cash')).toBe(true);
  });

  it('returns false for invalid tool IDs', () => {
    expect(isToolCapabilityId('fake_tool')).toBe(false);
    expect(isToolCapabilityId('send_message_extra')).toBe(false);
    expect(isToolCapabilityId('')).toBe(false);
    expect(isToolCapabilityId('SEND_MESSAGE')).toBe(false);
  });

  it('returns false for arbitrary strings', () => {
    expect(isToolCapabilityId('anything')).toBe(false);
    expect(isToolCapabilityId('foobar')).toBe(false);
  });

  it(' narrows type to ForgeCustomToolId when returning true', () => {
    const toolId: string = 'send_message';
    if (isToolCapabilityId(toolId)) {
      expect(toolId).toBe('send_message');
    }
  });
});

describe('normalizeToolPermissionIds', () => {
  it('returns empty array for empty input', () => {
    expect(normalizeToolPermissionIds([])).toEqual([]);
  });

  it('deduplicates entries', () => {
    expect(normalizeToolPermissionIds(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
  });

  it('sorts entries alphabetically', () => {
    expect(normalizeToolPermissionIds(['z', 'a', 'm'])).toEqual(['a', 'm', 'z']);
  });

  it('sorts after deduplication', () => {
    expect(normalizeToolPermissionIds(['c', 'a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('preserves all unique values', () => {
    const result = normalizeToolPermissionIds(['x', 'y', 'z', 'x']);
    expect(result).toHaveLength(3);
  });

  it('handles tool IDs with underscores and hyphens', () => {
    const result = normalizeToolPermissionIds(['list_conversations', 'send_message']);
    expect(result).toEqual(['list_conversations', 'send_message']);
  });

  it('handles readonly input', () => {
    const input: readonly string[] = ['b', 'a'];
    expect(normalizeToolPermissionIds(input)).toEqual(['a', 'b']);
  });

  it('does not mutate original array', () => {
    const input = ['z', 'a'];
    normalizeToolPermissionIds(input);
    expect(input).toEqual(['z', 'a']);
  });
});
