# Tools and Permissions

## Tool exposure model

Current runtime behavior is split into three layers:

1. Mastra built-in tools
   - always available

2. communication tools from the engine communication module
   - always available when the communication module is loaded

3. Forge custom tools
   - filtered by role permission before runtime creation

A current implementation detail that matters:

- the runtime builds a searchable tool map
- that map is passed into `ToolSearchProcessor`
- the agent itself is created with an empty direct tool map

So the live agent surface is currently based on processor-driven discovery, not eager direct injection of every custom tool.

## Communication tools

These come from the engine communication module and are not part of the Forge permission catalog:

- `list_contacts`
- `get_contact`
- `upsert_contact`
- `list_conversations`
- `get_messages`
- `send_message`

## Forge custom tool catalog

These ids are the current permission targets stored in role permissions.

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

## Workflow permissions

Current workflow ids in the permission model:

- `hire-internal-agent`
- `terminate-internal-agent`

Workflow filtering happens in the loader after resolving the role capability set.

## Current permission model

Permissions are based on literal ids:

- custom tool ids
- workflow ids

Each agent must have a `functionId`.

The function resolves to one role.

The role defines:

- allowed custom tool ids
- allowed workflow ids

Providers are not permission targets.

## Runtime enforcement

The current loader resolves the capability set before runtime construction and builds only the custom tool groups allowed for the agent.

This means denied custom tools are not exposed in the runtime build at all.

When role or function assignments change, loaded agents are reloaded so the runtime reflects the updated capability set.
