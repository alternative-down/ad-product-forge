INSERT INTO `role_tool_permissions` (`role_id`, `tool_id`, `created_at`)
WITH `tool_id_migration_map` (`old_id`, `new_id`) AS (
  VALUES
    ('get_company_cash_balance', 'get_company_cash'),
    ('list_company_cash_movements', 'list_company_cash'),
    ('get_company_cash_summary', 'list_company_cash'),
    ('list_active_internal_agent_contracts', 'list_internal_agent_contracts'),
    ('get_active_internal_agent_contract', 'list_internal_agent_contracts'),
    ('get_agent_notification', 'list_agent_notifications'),
    ('create_github_repository', 'manage_github_repository'),
    ('create_github_pull_request', 'manage_github_pull_request'),
    ('create_github_issue', 'manage_github_issue'),
    ('update_github_issue', 'manage_github_issue'),
    ('add_github_issue_labels', 'manage_github_issue'),
    ('remove_github_issue_labels', 'manage_github_issue'),
    ('close_github_issue', 'toggle_github_issue'),
    ('reopen_github_issue', 'toggle_github_issue'),
    ('list_github_issue_comments', 'manage_github_issue_comment'),
    ('create_github_issue_comment', 'manage_github_issue_comment'),
    ('create_coolify_application', 'manage_coolify_application'),
    ('update_coolify_application', 'manage_coolify_application'),
    ('delete_coolify_application', 'manage_coolify_application'),
    ('restart_coolify_application', 'manage_coolify_application'),
    ('start_coolify_application', 'toggle_coolify_application'),
    ('stop_coolify_application', 'toggle_coolify_application'),
    ('list_coolify_application_envs', 'get_coolify_application_envs'),
    ('set_coolify_application_env', 'manage_coolify_application_env'),
    ('delete_coolify_application_env', 'manage_coolify_application_env'),
    ('create_agent_schedule', 'manage_agent_schedule'),
    ('update_agent_schedule', 'manage_agent_schedule'),
    ('delete_agent_schedule', 'manage_agent_schedule'),
    ('create_agent_function', 'manage_agent_function'),
    ('update_agent_function', 'manage_agent_function'),
    ('create_agent_role', 'manage_agent_role'),
    ('update_agent_role', 'manage_agent_role'),
    ('add_role_tool_permission', 'manage_role_tool_permissions'),
    ('remove_role_tool_permission', 'manage_role_tool_permissions'),
    ('add_role_workflow_permission', 'manage_role_workflow_permissions'),
    ('remove_role_workflow_permission', 'manage_role_workflow_permissions'),
    ('list_available_custom_tools', 'list_available_capabilities'),
    ('list_available_workflows', 'list_available_capabilities')
)
SELECT
  permissions.`role_id`,
  mapping.`new_id`,
  MIN(permissions.`created_at`)
FROM `role_tool_permissions` AS permissions
INNER JOIN `tool_id_migration_map` AS mapping
  ON mapping.`old_id` = permissions.`tool_id`
LEFT JOIN `role_tool_permissions` AS existing
  ON existing.`role_id` = permissions.`role_id`
 AND existing.`tool_id` = mapping.`new_id`
WHERE existing.`role_id` IS NULL
GROUP BY permissions.`role_id`, mapping.`new_id`;

DELETE FROM `role_tool_permissions`
WHERE `tool_id` IN (
  'get_company_cash_balance',
  'list_company_cash_movements',
  'get_company_cash_summary',
  'list_active_internal_agent_contracts',
  'get_active_internal_agent_contract',
  'get_agent_notification',
  'create_github_repository',
  'create_github_pull_request',
  'create_github_issue',
  'update_github_issue',
  'add_github_issue_labels',
  'remove_github_issue_labels',
  'close_github_issue',
  'reopen_github_issue',
  'list_github_issue_comments',
  'create_github_issue_comment',
  'create_coolify_application',
  'update_coolify_application',
  'delete_coolify_application',
  'restart_coolify_application',
  'start_coolify_application',
  'stop_coolify_application',
  'list_coolify_application_envs',
  'set_coolify_application_env',
  'delete_coolify_application_env',
  'create_agent_schedule',
  'update_agent_schedule',
  'delete_agent_schedule',
  'create_agent_function',
  'update_agent_function',
  'create_agent_role',
  'update_agent_role',
  'add_role_tool_permission',
  'remove_role_tool_permission',
  'add_role_workflow_permission',
  'remove_role_workflow_permission',
  'list_available_custom_tools',
  'list_available_workflows'
);
