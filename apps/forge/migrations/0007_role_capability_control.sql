CREATE TABLE `agent_functions` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_functions_name_idx` ON `agent_functions` (`name`);
--> statement-breakpoint
CREATE TABLE `agent_roles` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agent_roles_name_idx` ON `agent_roles` (`name`);
--> statement-breakpoint
CREATE TABLE `function_roles` (
  `function_id` text NOT NULL,
  `role_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`function_id`) REFERENCES `agent_functions`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `function_roles_function_id_idx` ON `function_roles` (`function_id`);
--> statement-breakpoint
CREATE TABLE `role_tool_permissions` (
  `role_id` text NOT NULL,
  `tool_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_tool_permissions_unique_idx` ON `role_tool_permissions` (`role_id`, `tool_id`);
--> statement-breakpoint
CREATE INDEX `role_tool_permissions_role_id_idx` ON `role_tool_permissions` (`role_id`);
--> statement-breakpoint
CREATE TABLE `role_workflow_permissions` (
  `role_id` text NOT NULL,
  `workflow_id` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`role_id`) REFERENCES `agent_roles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `role_workflow_permissions_unique_idx` ON `role_workflow_permissions` (`role_id`, `workflow_id`);
--> statement-breakpoint
CREATE INDEX `role_workflow_permissions_role_id_idx` ON `role_workflow_permissions` (`role_id`);
--> statement-breakpoint
ALTER TABLE `agents` ADD `function_id` text REFERENCES `agent_functions`(`id`) ON UPDATE no action ON DELETE set null;
--> statement-breakpoint
INSERT INTO `agent_roles` (`id`, `name`, `description`, `created_at`, `updated_at`) VALUES
  ('finance', 'Finance', 'Financial ledger and contract visibility tools.', strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('github', 'GitHub', 'Repository, issue, and pull request management tools.', strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('deployment', 'Deployment', 'Coolify deployment and environment management tools.', strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('scheduling', 'Scheduling', 'Agent scheduled wake tools.', strftime('%s','now') * 1000, strftime('%s','now') * 1000),
  ('capability-management', 'Capability Management', 'Role, function, and internal workflow management tools.', strftime('%s','now') * 1000, strftime('%s','now') * 1000);
--> statement-breakpoint
INSERT INTO `role_tool_permissions` (`role_id`, `tool_id`, `created_at`) VALUES
  ('finance', 'list_agent_notifications', strftime('%s','now') * 1000),
  ('finance', 'get_agent_notification', strftime('%s','now') * 1000),
  ('finance', 'mark_agent_notification_read', strftime('%s','now') * 1000),
  ('finance', 'get_company_cash_balance', strftime('%s','now') * 1000),
  ('finance', 'list_company_cash_movements', strftime('%s','now') * 1000),
  ('finance', 'get_company_cash_summary', strftime('%s','now') * 1000),
  ('finance', 'list_active_internal_agent_contracts', strftime('%s','now') * 1000),
  ('finance', 'get_active_internal_agent_contract', strftime('%s','now') * 1000),
  ('github', 'list_agent_notifications', strftime('%s','now') * 1000),
  ('github', 'get_agent_notification', strftime('%s','now') * 1000),
  ('github', 'mark_agent_notification_read', strftime('%s','now') * 1000),
  ('github', 'get_github_git_credentials', strftime('%s','now') * 1000),
  ('github', 'list_github_repositories', strftime('%s','now') * 1000),
  ('github', 'create_github_repository', strftime('%s','now') * 1000),
  ('github', 'get_github_repository', strftime('%s','now') * 1000),
  ('github', 'list_github_pull_requests', strftime('%s','now') * 1000),
  ('github', 'create_github_pull_request', strftime('%s','now') * 1000),
  ('github', 'list_github_issues', strftime('%s','now') * 1000),
  ('github', 'get_github_issue', strftime('%s','now') * 1000),
  ('github', 'create_github_issue', strftime('%s','now') * 1000),
  ('github', 'update_github_issue', strftime('%s','now') * 1000),
  ('github', 'close_github_issue', strftime('%s','now') * 1000),
  ('github', 'reopen_github_issue', strftime('%s','now') * 1000),
  ('github', 'list_github_issue_comments', strftime('%s','now') * 1000),
  ('github', 'create_github_issue_comment', strftime('%s','now') * 1000),
  ('github', 'list_github_labels', strftime('%s','now') * 1000),
  ('github', 'add_github_issue_labels', strftime('%s','now') * 1000),
  ('github', 'remove_github_issue_labels', strftime('%s','now') * 1000),
  ('github', 'list_github_milestones', strftime('%s','now') * 1000),
  ('deployment', 'list_agent_notifications', strftime('%s','now') * 1000),
  ('deployment', 'get_agent_notification', strftime('%s','now') * 1000),
  ('deployment', 'mark_agent_notification_read', strftime('%s','now') * 1000),
  ('deployment', 'list_coolify_github_apps', strftime('%s','now') * 1000),
  ('deployment', 'list_coolify_github_app_repositories', strftime('%s','now') * 1000),
  ('deployment', 'list_coolify_github_app_repository_branches', strftime('%s','now') * 1000),
  ('deployment', 'list_coolify_applications', strftime('%s','now') * 1000),
  ('deployment', 'create_coolify_application', strftime('%s','now') * 1000),
  ('deployment', 'get_coolify_application', strftime('%s','now') * 1000),
  ('deployment', 'update_coolify_application', strftime('%s','now') * 1000),
  ('deployment', 'start_coolify_application', strftime('%s','now') * 1000),
  ('deployment', 'stop_coolify_application', strftime('%s','now') * 1000),
  ('deployment', 'restart_coolify_application', strftime('%s','now') * 1000),
  ('deployment', 'delete_coolify_application', strftime('%s','now') * 1000),
  ('deployment', 'list_coolify_application_deployments', strftime('%s','now') * 1000),
  ('deployment', 'get_coolify_deployment_logs', strftime('%s','now') * 1000),
  ('deployment', 'get_coolify_application_logs', strftime('%s','now') * 1000),
  ('deployment', 'list_coolify_application_envs', strftime('%s','now') * 1000),
  ('deployment', 'set_coolify_application_env', strftime('%s','now') * 1000),
  ('deployment', 'delete_coolify_application_env', strftime('%s','now') * 1000),
  ('scheduling', 'list_agent_notifications', strftime('%s','now') * 1000),
  ('scheduling', 'get_agent_notification', strftime('%s','now') * 1000),
  ('scheduling', 'mark_agent_notification_read', strftime('%s','now') * 1000),
  ('scheduling', 'create_agent_schedule', strftime('%s','now') * 1000),
  ('scheduling', 'list_agent_schedules', strftime('%s','now') * 1000),
  ('scheduling', 'update_agent_schedule', strftime('%s','now') * 1000),
  ('scheduling', 'delete_agent_schedule', strftime('%s','now') * 1000),
  ('capability-management', 'list_agent_notifications', strftime('%s','now') * 1000),
  ('capability-management', 'get_agent_notification', strftime('%s','now') * 1000),
  ('capability-management', 'mark_agent_notification_read', strftime('%s','now') * 1000),
  ('capability-management', 'list_agent_functions', strftime('%s','now') * 1000),
  ('capability-management', 'create_agent_function', strftime('%s','now') * 1000),
  ('capability-management', 'update_agent_function', strftime('%s','now') * 1000),
  ('capability-management', 'list_agent_roles', strftime('%s','now') * 1000),
  ('capability-management', 'create_agent_role', strftime('%s','now') * 1000),
  ('capability-management', 'update_agent_role', strftime('%s','now') * 1000),
  ('capability-management', 'assign_role_to_function', strftime('%s','now') * 1000),
  ('capability-management', 'change_agent_function', strftime('%s','now') * 1000),
  ('capability-management', 'change_own_function', strftime('%s','now') * 1000),
  ('capability-management', 'list_role_tool_permissions', strftime('%s','now') * 1000),
  ('capability-management', 'add_role_tool_permission', strftime('%s','now') * 1000),
  ('capability-management', 'remove_role_tool_permission', strftime('%s','now') * 1000),
  ('capability-management', 'list_role_workflow_permissions', strftime('%s','now') * 1000),
  ('capability-management', 'add_role_workflow_permission', strftime('%s','now') * 1000),
  ('capability-management', 'remove_role_workflow_permission', strftime('%s','now') * 1000),
  ('capability-management', 'list_available_custom_tools', strftime('%s','now') * 1000),
  ('capability-management', 'list_available_workflows', strftime('%s','now') * 1000);
--> statement-breakpoint
INSERT INTO `role_workflow_permissions` (`role_id`, `workflow_id`, `created_at`) VALUES
  ('capability-management', 'hire-internal-agent', strftime('%s','now') * 1000),
  ('capability-management', 'terminate-internal-agent', strftime('%s','now') * 1000);
