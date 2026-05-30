/**
 * Unit tests for capabilities/permissions.ts.
 *
 * Tests resolveLoadedToolIds() - the tool ID resolver that handles
 * cross-cutting permission rules (role inspection, self cron, cross-agent cron).
 */
import { describe, expect, it } from 'vitest';
import { resolveLoadedToolIds, ROLE_INSPECTION_TOOL_IDS } from './permissions';

describe('ROLE_INSPECTION_TOOL_IDS', () => {
  it('should contain the expected role inspection tool IDs', () => {
    expect(ROLE_INSPECTION_TOOL_IDS).toContain('manage_agent_role');
    expect(ROLE_INSPECTION_TOOL_IDS).toContain('change_agent_role');
    expect(ROLE_INSPECTION_TOOL_IDS).toContain('list_role_capabilities');
    expect(ROLE_INSPECTION_TOOL_IDS).toContain('manage_role_capabilities');
    expect(ROLE_INSPECTION_TOOL_IDS).toHaveLength(4);
  });

  it('should be a readonly tuple', () => {
    
    expect((ROLE_INSPECTION_TOOL_IDS as any)[0]).toBe('manage_agent_role');
  });
});

describe('resolveLoadedToolIds', () => {
  it('should return self cron tools when given no input (no cross-agent cron to exclude them)', () => {
    const result = resolveLoadedToolIds([]);
    expect(result).toContain('list_self_crons');
    expect(result).toContain('manage_self_crons');
  });

  it('should not mutate the input array', () => {
    const input: string[] = [];
    resolveLoadedToolIds(input);
    expect(input).toHaveLength(0);
  });

  it('should add list_agent_roles when any role inspection tool is present', () => {
    const result = resolveLoadedToolIds(['manage_agent_role']);
    expect(result).toContain('list_agent_roles');
  });

  it('should add list_agent_roles for change_agent_role', () => {
    const result = resolveLoadedToolIds(['change_agent_role']);
    expect(result).toContain('list_agent_roles');
  });

  it('should add list_agent_roles for list_role_capabilities', () => {
    const result = resolveLoadedToolIds(['list_role_capabilities']);
    expect(result).toContain('list_agent_roles');
  });

  it('should add list_agent_roles for manage_role_capabilities', () => {
    const result = resolveLoadedToolIds(['manage_role_capabilities']);
    expect(result).toContain('list_agent_roles');
  });

  it('should add list_role_capabilities when manage_role_capabilities is present', () => {
    const result = resolveLoadedToolIds(['manage_role_capabilities']);
    expect(result).toContain('list_role_capabilities');
  });

  it('should add self cron tools when no cross-agent cron tools are present', () => {
    const result = resolveLoadedToolIds([]);
    expect(result).toContain('manage_self_crons');
    expect(result).toContain('list_self_crons');
  });

  it('should not add self cron tools when cross-agent cron tools are present', () => {
    const result = resolveLoadedToolIds(['manage_crons']);
    expect(result).not.toContain('manage_self_crons');
    expect(result).not.toContain('list_self_crons');
  });

  it('should not add self cron tools when list_crons is present', () => {
    const result = resolveLoadedToolIds(['list_crons']);
    expect(result).not.toContain('manage_self_crons');
    expect(result).not.toContain('list_self_crons');
  });

  it('should keep manage_crons when it is the only input', () => {
    const result = resolveLoadedToolIds(['manage_crons']);
    expect(result).toContain('manage_crons');
  });

  it('should handle complex scenario with role inspection and cross-agent cron', () => {
    const result = resolveLoadedToolIds(['manage_agent_role', 'manage_crons']);
    expect(result).toContain('list_agent_roles');
    expect(result).toContain('manage_crons');
    expect(result).not.toContain('manage_self_crons');
    expect(result).not.toContain('list_self_crons');
  });

  it('should return a sorted array', () => {
    const result = resolveLoadedToolIds(['z_tool', 'a_tool', 'm_tool']);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1] <= result[i]).toBe(true);
    }
  });

  it('should not duplicate tool IDs already in input', () => {
    const result = resolveLoadedToolIds(['list_agent_roles', 'manage_agent_role']);
    const listAgentRolesCount = result.filter(id => id === 'list_agent_roles').length;
    expect(listAgentRolesCount).toBe(1);
  });

  it('should add list_role_capabilities only once even with manage_role_capabilities', () => {
    const result = resolveLoadedToolIds(['manage_role_capabilities']);
    expect(result.filter(id => id === 'list_role_capabilities')).toHaveLength(1);
  });

  it('should return self cron tools as default when no specific tools are requested', () => {
    const result = resolveLoadedToolIds([]);
    expect(result).toContain('manage_self_crons');
    expect(result).toContain('list_self_crons');
    expect(result).not.toContain('list_agent_roles'); // no role inspection tools
  });

  it('should handle multiple role inspection tools without duplication', () => {
    const result = resolveLoadedToolIds(['manage_agent_role', 'change_agent_role']);
    expect(result).toContain('list_agent_roles');
    const count = result.filter(id => id === 'list_agent_roles').length;
    expect(count).toBe(1);
  });
});
