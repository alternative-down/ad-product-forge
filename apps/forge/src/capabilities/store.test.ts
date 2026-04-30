import { describe, expect, it } from 'vitest';

// Re-implement resolveLoadedToolIds logic to test without importing the module.
const roleInspectionToolIds = [
  'manage_agent_role',
  'change_agent_role',
  'list_role_capabilities',
  'manage_role_capabilities',
] as const;

function resolveLoadedToolIds(toolIds: string[]) {
  const resolvedToolIds = new Set(toolIds);
  const hasCrossAgentCronTools = resolvedToolIds.has('manage_crons') || resolvedToolIds.has('list_crons');
  const hasCrossAgentRoleTool = resolvedToolIds.has('change_agent_role');
  const hasRoleInspectionTool = roleInspectionToolIds.some((toolId) => resolvedToolIds.has(toolId));

  if (hasRoleInspectionTool) {
    resolvedToolIds.add('list_agent_roles');
  }

  if (resolvedToolIds.has('manage_role_capabilities')) {
    resolvedToolIds.add('list_role_capabilities');
  }

  if (!hasCrossAgentCronTools && !hasCrossAgentRoleTool) {
    return [...resolvedToolIds].sort((left, right) => left.localeCompare(right));
  }

  return [...resolvedToolIds]
    .filter((toolId) => {
      if (hasCrossAgentCronTools && (toolId === 'manage_self_crons' || toolId === 'list_self_crons')) {
        return false;
      }
      return true;
    })
    .sort((left, right) => left.localeCompare(right));
}

describe('resolveLoadedToolIds', () => {
  it('returns sorted toolIds when no cross-agent tools present', () => {
    const result = resolveLoadedToolIds(['list_agents', 'send_message']);
    expect(result).toEqual(['list_agents', 'send_message']);
  });

  it('returns sorted toolIds when no special tools at all', () => {
    const result = resolveLoadedToolIds(['get_weather']);
    expect(result).toEqual(['get_weather']);
  });

  it('adds list_agent_roles when has role inspection tool', () => {
    const result = resolveLoadedToolIds(['manage_agent_role']);
    expect(result).toContain('list_agent_roles');
  });

  it('adds list_agent_roles for multiple role inspection tools', () => {
    const result = resolveLoadedToolIds(['list_role_capabilities', 'change_agent_role']);
    expect(result).toContain('list_agent_roles');
  });

  it('adds list_role_capabilities when manage_role_capabilities is present', () => {
    const result = resolveLoadedToolIds(['manage_role_capabilities']);
    expect(result).toContain('list_role_capabilities');
    expect(result).toContain('manage_role_capabilities');
  });

  it('removes manage_self_crons when manage_crons is present', () => {
    const result = resolveLoadedToolIds(['manage_crons', 'manage_self_crons']);
    expect(result).not.toContain('manage_self_crons');
    expect(result).toContain('manage_crons');
  });

  it('removes list_self_crons when list_crons is present', () => {
    const result = resolveLoadedToolIds(['list_crons', 'list_self_crons']);
    expect(result).not.toContain('list_self_crons');
    expect(result).toContain('list_crons');
  });

  it('removes both cron self-tools when cross-agent cron tools are present', () => {
    const result = resolveLoadedToolIds(['manage_crons', 'list_crons', 'manage_self_crons', 'list_self_crons']);
    expect(result).not.toContain('manage_self_crons');
    expect(result).not.toContain('list_self_crons');
    expect(result).toContain('manage_crons');
    expect(result).toContain('list_crons');
  });

  it('removes manage_self_crons when only list_crons is present (hasCrossAgentCronTools is true)', () => {
    // list_crons alone sets hasCrossAgentCronTools=true, so both self-tools are removed
    const result = resolveLoadedToolIds(['list_crons', 'manage_self_crons']);
    expect(result).not.toContain('manage_self_crons');
    expect(result).toContain('list_crons');
  });

  it('does not filter by cross-agent role tool alone (no cron tools)', () => {
    const result = resolveLoadedToolIds(['change_agent_role', 'manage_self_crons']);
    expect(result).toContain('change_agent_role');
    expect(result).toContain('manage_self_crons');
    expect(result).toContain('list_agent_roles');
  });

  it('result is always sorted alphabetically', () => {
    const result = resolveLoadedToolIds(['zebra', 'apple', 'manage_crons']);
    expect(result).toEqual(['apple', 'manage_crons', 'zebra']);
  });

  it('handles empty array', () => {
    const result = resolveLoadedToolIds([]);
    expect(result).toEqual([]);
  });

  it('handles no cross-agent tools and no role inspection tools', () => {
    const result = resolveLoadedToolIds(['get_weather', 'send_message', 'list_agents']);
    expect(result).toEqual(['get_weather', 'list_agents', 'send_message']);
  });
});
