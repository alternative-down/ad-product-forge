export const forgeCustomToolIds = [
  'search_web',
  'list_contacts',
  'get_contact',
  'upsert_contact',
  'list_conversations',
  'get_messages',
  'send_message',
  'create_chat_group',
  'add_member_to_group',
  'remove_member_from_group',
  'list_chat_groups',
  'list_group_members',
  'list_company_cash',
  'get_company_cash',
  'list_internal_agent_contracts',
  'manage_internal_agent_contract',
  'adjust_agent_contract_budget',
  'list_agent_notifications',
  'mark_agent_notification_read',
  'get_github_git_credentials',
  'list_github_repositories',
  'get_github_repository',
  'manage_github_repository',
  'create_github_repository',
  'update_github_repository',
  'delete_github_repository',
  'list_github_pull_requests',
  'get_github_pull_request',
  'manage_github_pull_request',
  'create_github_pull_request',
  'update_github_pull_request',
  'merge_github_pull_request',
  'delete_github_pull_request',
  'list_github_pull_request_comments',
  'list_github_issues',
  'get_github_issue',
  'manage_github_issue',
  'create_github_issue',
  'update_github_issue',
  'delete_github_issue',
  'toggle_github_issue',
  'manage_github_issue_comment',
  'list_github_issue_comments',
  'get_github_issue_comment',
  'create_github_issue_comment',
  'update_github_issue_comment',
  'delete_github_issue_comment',
  'list_github_labels',
  'manage_github_label',
  'create_github_label',
  'update_github_label',
  'delete_github_label',
  'list_github_milestones',
  'manage_github_milestone',
  'create_github_milestone',
  'update_github_milestone',
  'delete_github_milestone',
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
  'list_agent_schedules',
  'manage_agent_schedule',
  'toggle_agent_schedule',
  'create_cron_for_agent',
  'edit_cron',
  'delete_cron',
  'create_task_for_agent',
  'list_agent_tasks',
  'cancel_agent_task',
  'update_agent_task',
  'list_agent_functions',
  'manage_agent_function',
  'list_agent_roles',
  'manage_agent_role',
  'assign_role_to_function',
  'change_agent_function',
  'change_own_function',
  'list_role_tool_permissions',
  'manage_role_tool_permissions',
  'list_role_workflow_permissions',
  'manage_role_workflow_permissions',
  'list_available_capabilities',
  'minimax_tts',
  'minimax_image',
  'minimax_video',
] as const;

export const forgeWorkflowIds = [
  'hire-internal-agent',
  'terminate-internal-agent',
] as const;

export type ForgeCustomToolId = typeof forgeCustomToolIds[number];
export type ForgeWorkflowId = typeof forgeWorkflowIds[number];

export const legacyToolPermissionAliases: Partial<Record<ForgeCustomToolId, readonly string[]>> = {
  // @deprecated - use create_github_repository, update_github_repository, delete_github_repository
  list_company_cash: [
    'list_company_cash_movements',
    'get_company_cash_summary',
  ],
  get_company_cash: [
    'get_company_cash_balance',
  ],
  list_internal_agent_contracts: [
    'list_active_internal_agent_contracts',
    'get_active_internal_agent_contract',
  ],
  manage_internal_agent_contract: [
    'top_up_internal_agent_contract',
  ],
  adjust_agent_contract_budget: [
    'adjust_internal_agent_contract_budget',
  ],
  list_agent_notifications: [
    'get_agent_notification',
  ],
  // @deprecated - redirects to manage_github_repository (tool split in progress)
  manage_github_repository: [
    'create_github_repository',
  ],
  // @deprecated - redirects to manage_github_pull_request (tool split in progress)
  manage_github_pull_request: [
    'create_github_pull_request',
  ],
  list_github_pull_request_comments: [
    'list_github_pull_request_comments',
  ],
  // @deprecated - toggle_github_issue is the canonical tool
  toggle_github_issue: [
    'toggle_github_issue',
  ],
  manage_coolify_application: [
    'create_coolify_application',
    'update_coolify_application',
    'delete_coolify_application',
    'restart_coolify_application',
  ],
  toggle_coolify_application: [
    'start_coolify_application',
    'stop_coolify_application',
  ],
  get_coolify_application_envs: [
    'list_coolify_application_envs',
  ],
  manage_coolify_application_env: [
    'set_coolify_application_env',
    'delete_coolify_application_env',
  ],
  toggle_agent_schedule: [
    'update_agent_schedule',
  ],
  // @deprecated - redirects to split tools (Issue #225)
  create_cron_for_agent: [
    'create_schedule_for_agent',
  ],
  edit_cron: [
    'edit_schedule',
  ],
  delete_cron: [
    'delete_schedule',
  ],
  manage_agent_function: [
    'create_agent_function',
    'update_agent_function',
  ],
  manage_agent_role: [
    'create_agent_role',
    'update_agent_role',
  ],
  manage_role_tool_permissions: [
    'add_role_tool_permission',
    'remove_role_tool_permission',
  ],
  manage_role_workflow_permissions: [
    'add_role_workflow_permission',
    'remove_role_workflow_permission',
  ],
  list_available_capabilities: [
    'list_available_custom_tools',
    'list_available_workflows',
  ],
};

export function hasToolPermission(allowedToolIds: Set<string> | null | undefined, toolId: ForgeCustomToolId) {
  if (!allowedToolIds) {
    return true;
  }

  if (allowedToolIds.has(toolId)) {
    return true;
  }

  const aliases = legacyToolPermissionAliases[toolId] ?? [];
  return aliases.some((alias) => allowedToolIds.has(alias));
}

export function normalizeToolPermissionIds(toolIds: readonly string[]) {
  const normalized = new Set<string>();

  for (const toolId of toolIds) {
    const canonical = forgeCustomToolIds.find((candidate) => {
      if (candidate === toolId) {
        return true;
      }

      return (legacyToolPermissionAliases[candidate] ?? []).includes(toolId);
    });

    normalized.add(canonical ?? toolId);
  }

  return [...normalized].sort((left, right) => left.localeCompare(right));
}
