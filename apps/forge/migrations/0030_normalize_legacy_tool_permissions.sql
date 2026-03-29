-- Migration: 0030_normalize_legacy_tool_permissions.sql
-- Description: Normalize legacy tool permission aliases to canonical tool IDs in roleToolPermissions
-- This migration updates roleToolPermissions entries that use deprecated tool names to use canonical names
-- After this migration, the legacy aliases can be removed from the codebase

-- Define aliases: canonical_tool_id -> [legacy_tool_id, ...]
-- Each UPDATE checks if the alias exists before updating to avoid conflicts

-- list_company_cash aliases
UPDATE role_tool_permissions
SET tool_id = 'list_company_cash'
WHERE tool_id IN ('list_company_cash_movements', 'get_company_cash_summary')
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'list_company_cash'
);

-- get_company_cash alias
UPDATE role_tool_permissions
SET tool_id = 'get_company_cash'
WHERE tool_id = 'get_company_cash_balance'
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'get_company_cash'
);

-- list_internal_agent_contracts aliases
UPDATE role_tool_permissions
SET tool_id = 'list_internal_agent_contracts'
WHERE tool_id IN ('list_active_internal_agent_contracts', 'get_active_internal_agent_contract')
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'list_internal_agent_contracts'
);

-- manage_internal_agent_contract alias
UPDATE role_tool_permissions
SET tool_id = 'manage_internal_agent_contract'
WHERE tool_id = 'top_up_internal_agent_contract'
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'manage_internal_agent_contract'
);

-- adjust_agent_contract_budget alias
UPDATE role_tool_permissions
SET tool_id = 'adjust_agent_contract_budget'
WHERE tool_id = 'adjust_internal_agent_contract_budget'
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'adjust_agent_contract_budget'
);

-- list_agent_notifications alias
UPDATE role_tool_permissions
SET tool_id = 'list_agent_notifications'
WHERE tool_id = 'get_agent_notification'
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'list_agent_notifications'
);

-- list_github_pull_request_comments alias (self-referential, idempotent)
UPDATE role_tool_permissions
SET tool_id = 'list_github_pull_request_comments'
WHERE tool_id = 'list_github_pull_request_comments';

-- toggle_github_issue alias (self-referential, idempotent)
UPDATE role_tool_permissions
SET tool_id = 'toggle_github_issue'
WHERE tool_id = 'toggle_github_issue';

-- manage_coolify_application aliases
UPDATE role_tool_permissions
SET tool_id = 'manage_coolify_application'
WHERE tool_id IN ('create_coolify_application', 'update_coolify_application', 'delete_coolify_application', 'restart_coolify_application')
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'manage_coolify_application'
);

-- toggle_coolify_application aliases
UPDATE role_tool_permissions
SET tool_id = 'toggle_coolify_application'
WHERE tool_id IN ('start_coolify_application', 'stop_coolify_application')
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'toggle_coolify_application'
);

-- get_coolify_application_envs alias
UPDATE role_tool_permissions
SET tool_id = 'get_coolify_application_envs'
WHERE tool_id = 'list_coolify_application_envs'
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'get_coolify_application_envs'
);

-- manage_coolify_application_env aliases
UPDATE role_tool_permissions
SET tool_id = 'manage_coolify_application_env'
WHERE tool_id IN ('set_coolify_application_env', 'delete_coolify_application_env')
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'manage_coolify_application_env'
);

-- create_cron_for_agent alias
UPDATE role_tool_permissions
SET tool_id = 'create_cron_for_agent'
WHERE tool_id = 'create_schedule_for_agent'
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'create_cron_for_agent'
);

-- edit_cron alias
UPDATE role_tool_permissions
SET tool_id = 'edit_cron'
WHERE tool_id = 'edit_schedule'
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'edit_cron'
);

-- delete_cron alias
UPDATE role_tool_permissions
SET tool_id = 'delete_cron'
WHERE tool_id = 'delete_schedule'
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'delete_cron'
);

-- manage_agent_function aliases
UPDATE role_tool_permissions
SET tool_id = 'manage_agent_function'
WHERE tool_id IN ('create_agent_function', 'update_agent_function')
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'manage_agent_function'
);

-- manage_agent_role aliases
UPDATE role_tool_permissions
SET tool_id = 'manage_agent_role'
WHERE tool_id IN ('create_agent_role', 'update_agent_role')
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'manage_agent_role'
);

-- manage_role_tool_permissions aliases
UPDATE role_tool_permissions
SET tool_id = 'manage_role_tool_permissions'
WHERE tool_id IN ('add_role_tool_permission', 'remove_role_tool_permission')
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'manage_role_tool_permissions'
);

-- manage_role_workflow_permissions aliases
UPDATE role_tool_permissions
SET tool_id = 'manage_role_workflow_permissions'
WHERE tool_id IN ('add_role_workflow_permission', 'remove_role_workflow_permission')
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'manage_role_workflow_permissions'
);

-- list_available_capabilities aliases
UPDATE role_tool_permissions
SET tool_id = 'list_available_capabilities'
WHERE tool_id IN ('list_available_custom_tools', 'list_available_workflows')
AND NOT EXISTS (
    SELECT 1 FROM role_tool_permissions r2
    WHERE r2.role_id = role_tool_permissions.role_id
    AND r2.tool_id = 'list_available_capabilities'
);
