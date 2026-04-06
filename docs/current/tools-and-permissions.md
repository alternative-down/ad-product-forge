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
- `upsert_contact`
- `list_conversations`
- `get_messages`
- `send_message`

## Forge custom tool catalog

These ids are the current permission targets stored in role permissions.

### Micro ERP

- `list_company_cash`
- `get_company_cash`
- `list_internal_agent_contracts`

### Notifications

- `list_agent_notifications`

### GitHub

- `get_github_git_credentials`
- `list_github_repositories`
- `get_github_repository`
- `create_github_repository`
- `update_github_repository`
- `delete_github_repository`
- `list_github_pull_requests`
- `get_github_pull_request`
- `create_github_pull_request`
- `update_github_pull_request`
- `merge_github_pull_request`
- `delete_github_pull_request`
- `list_github_issues`
- `get_github_issue`
- `create_github_issue`
- `update_github_issue`
- `delete_github_issue`
- `toggle_github_issue`
- `list_github_issue_comments`
- `get_github_issue_comment`
- `create_github_issue_comment`
- `update_github_issue_comment`
- `delete_github_issue_comment`
- `list_github_labels`
- `create_github_label`
- `update_github_label`
- `delete_github_label`
- `list_github_milestones`
- `create_github_milestone`
- `update_github_milestone`
- `delete_github_milestone`

### MiniMax (requer chave API)

- `minimax_tts`
- `minimax_image`
- `minimax_video`

### Coolify

- `list_coolify_github_apps`
- `list_coolify_github_app_repositories`
- `list_coolify_github_app_repository_branches`
- `list_coolify_applications`
- `get_coolify_application`
- `manage_coolify_application`
- `toggle_coolify_application`
- `list_coolify_application_deployments`
- `get_coolify_deployment_logs`
- `get_coolify_application_logs`
- `get_coolify_application_envs`
- `manage_coolify_application_env`

### Schedules

- `list_self_crons`
- `manage_self_crons`
- `list_crons`
- `manage_crons`

### Capability management

- `list_agent_functions`
- `create_agent_function`
- `update_agent_function`
- `delete_agent_function`
- `list_agent_roles`
- `manage_agent_role`
- `assign_role_to_function`
- `change_agent_function`
- `list_role_capabilities`
- `manage_role_capabilities`

### MCP (Model Context Protocol)

- MCP tools are dynamically loaded per-agente based em `agentMcpConfigs`
- Cada servidor MCP expose tools namespaced as `{serverName}_{toolName}`
- Tools disponíveis: qualquer tool exposta pelo servidor MCP configurado

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
