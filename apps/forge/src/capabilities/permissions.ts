export const ROLE_INSPECTION_TOOL_IDS = [
  'manage_agent_role',
  'change_agent_role',
  'list_role_capabilities',
  'manage_role_capabilities',
] as const;

export function resolveLoadedToolIds(toolIds: string[]) {
  const resolvedToolIds = new Set(toolIds);
  const hasCrossAgentCronTools =
    resolvedToolIds.has('manage_crons') || resolvedToolIds.has('list_crons');
  const hasRoleInspectionTool = ROLE_INSPECTION_TOOL_IDS.some((toolId) =>
    resolvedToolIds.has(toolId),
  );

  if (hasRoleInspectionTool) {
    resolvedToolIds.add('list_agent_roles');
  }

  if (resolvedToolIds.has('manage_role_capabilities')) {
    resolvedToolIds.add('list_role_capabilities');
  }

  if (!hasCrossAgentCronTools) {
    resolvedToolIds.add('manage_self_crons');
    resolvedToolIds.add('list_self_crons');
  }

  if (hasCrossAgentCronTools) {
    resolvedToolIds.delete('manage_self_crons');
    resolvedToolIds.delete('list_self_crons');
  }

  return [...resolvedToolIds].sort((left, right) => left.localeCompare(right));
}