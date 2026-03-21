# Tools and Permissions

## Built-in vs custom tools

Current runtime behavior:

- Mastra built-in tools are always available.
- Communication tools injected by the communication module are always available.
- Forge custom tools are filtered by role permission.
- Workflows are filtered by role permission.
- Providers are provisioned by hiring and runtime load. They are not permission targets.

## Communication tools

These come from the engine communication module and are always available when the communication module is present:

- `list_contacts`
- `get_contact`
- `upsert_contact`
- `list_conversations`
- `get_messages`
- `send_message`

## Forge custom tool groups

### Micro ERP

- `get_company_cash_balance`
- `list_company_cash_movements`
- `get_company_cash_summary`
- `list_active_internal_agent_contracts`
- `get_active_internal_agent_contract`

### Notifications

- `list_agent_notifications`
- `get_agent_notification`
- `mark_agent_notification_read`

### GitHub

- `get_github_git_credentials`
- `list_github_repositories`
- `create_github_repository`
- `get_github_repository`
- `list_github_pull_requests`
- `create_github_pull_request`
- `list_github_issues`
- `get_github_issue`
- `create_github_issue`
- `update_github_issue`
- `close_github_issue`
- `reopen_github_issue`
- `list_github_issue_comments`
- `create_github_issue_comment`
- `list_github_labels`
- `add_github_issue_labels`
- `remove_github_issue_labels`
- `list_github_milestones`

### Coolify

- `list_coolify_github_apps`
- `list_coolify_github_app_repositories`
- `list_coolify_github_app_repository_branches`
- `list_coolify_applications`
- `create_coolify_application`
- `get_coolify_application`
- `update_coolify_application`
- `start_coolify_application`
- `stop_coolify_application`
- `restart_coolify_application`
- `delete_coolify_application`
- `list_coolify_application_deployments`
- `get_coolify_deployment_logs`
- `get_coolify_application_logs`
- `list_coolify_application_envs`
- `set_coolify_application_env`
- `delete_coolify_application_env`

### Schedules

- `create_agent_schedule`
- `list_agent_schedules`
- `update_agent_schedule`
- `delete_agent_schedule`

### Capability management

- `list_agent_functions`
- `create_agent_function`
- `update_agent_function`
- `list_agent_roles`
- `create_agent_role`
- `update_agent_role`
- `assign_role_to_function`
- `change_agent_function`
- `change_own_function`
- `list_role_tool_permissions`
- `add_role_tool_permission`
- `remove_role_tool_permission`
- `list_role_workflow_permissions`
- `add_role_workflow_permission`
- `remove_role_workflow_permission`
- `list_available_custom_tools`
- `list_available_workflows`

## Current permission model

Permissions are based on literal ids:

- custom tool ids
- workflow ids

Each agent must have a `functionId`.

The function resolves to one role.

The role defines:

- allowed custom tool ids
- allowed workflow ids

## Current runtime enforcement

The current loader resolves the capability set before runtime construction and builds only the custom tool groups allowed for the agent.

This means the runtime does not expose denied custom tools in the first place.
