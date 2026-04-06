export const forgeCustomToolIds = [
  'list_contacts',
  'upsert_contact',
  'list_conversations',
  'get_messages',
  'send_message',
  'change_chat_group',
  'list_company_cash',
  'get_company_cash',
  'list_internal_agent_contracts',
  'adjust_agent_contract_budget',
  'list_agent_notifications',
  'get_github_git_credentials',
  'list_coolify_github_apps',
  'list_coolify_github_app_repositories',
  'list_coolify_github_app_repository_branches',
  'list_coolify_applications',
  'get_coolify_application',
  'manage_coolify_application',
  'toggle_coolify_application',
  'list_coolify_application_deployments',
  'get_coolify_deployment_logs',
  'get_coolify_application_logs',
  'get_coolify_application_envs',
  'manage_coolify_application_env',
  'list_self_crons',
  'manage_self_crons',
  'list_crons',
  'manage_crons',
  'list_agent_roles',
  'manage_agent_role',
  'change_agent_role',
  'list_role_capabilities',
  'manage_role_capabilities',
  'list_minimax_voices',
  'minimax_tts',
  'minimax_image',
] as const;

export const forgeWorkflowIds = [
  'hire-internal-agent',
  'terminate-internal-agent',
] as const;

export type ForgeCustomToolId = typeof forgeCustomToolIds[number];
export type ForgeWorkflowId = typeof forgeWorkflowIds[number];
export const forgeCapabilityIds = [...forgeCustomToolIds, ...forgeWorkflowIds] as const;
export type ForgeCapabilityId = typeof forgeCapabilityIds[number];

export function hasToolPermission(allowedToolIds: Set<string> | null | undefined, toolId: ForgeCustomToolId) {
  if (!allowedToolIds) {
    return true;
  }

  if (allowedToolIds.has(toolId)) {
    return true;
  }

  return false;
}

export function isWorkflowCapabilityId(capabilityId: string): capabilityId is ForgeWorkflowId {
  return forgeWorkflowIds.some((workflowId) => workflowId === capabilityId);
}

export function isToolCapabilityId(capabilityId: string): capabilityId is ForgeCustomToolId {
  return forgeCustomToolIds.some((toolId) => toolId === capabilityId);
}

export function normalizeToolPermissionIds(toolIds: readonly string[]) {
  return [...new Set(toolIds)].sort((left, right) => left.localeCompare(right));
}
