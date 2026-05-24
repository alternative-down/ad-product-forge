export const forgeCustomToolIds = [
  'list_contacts',
  'upsert_contact',
  'list_conversations',
  'get_messages',
  'send_message',
  'change_chat_group',
  'publish_skill_to_catalog',
  'list_company_cash',
  'get_company_cash',
  'manage_company_cash_movement',
  'list_internal_agent_contracts',
  'adjust_agent_contract_budget',
  'list_agent_notifications',
  'get_github_git_credentials',
  'get_github_provisioning_status',
  'start_github_app_provisioning',
  'list_coolify_applications',
  'start_coolify_application',
  'stop_coolify_application',
  'get_coolify_application_logs',
  'list_self_crons',
  'manage_self_crons',
  'list_crons',
  'manage_crons',
  'list_agent_roles',
  'manage_agent_role',
  'change_agent_role',
  'list_agent_statuses',
  'list_role_capabilities',
  'manage_role_capabilities',
  'list_minimax_voices',
  'minimax_tts',
  'minimax_image',
  'hire-internal-agent',
  'terminate-internal-agent',
] as const;

export const forgeCapabilityIds = [...forgeCustomToolIds] as const;

export type ForgeCustomToolId = (typeof forgeCustomToolIds)[number];

export function hasToolPermission(
  allowedToolIds: Set<string> | null | undefined,
) {
  if (!allowedToolIds) {
    return true;
  }

  if (allowedToolIds.has(toolId)) {
    return true;
  }

  return false;
}

export function normalizeToolPermissionIds(toolIds: readonly string[]) {
  return [...new Set(toolIds)].sort((left, right) => left.localeCompare(right));
}
