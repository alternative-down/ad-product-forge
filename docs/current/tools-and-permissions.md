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
- `manage_company_cash_movement`
- `list_internal_agent_contracts`

### Notifications

- `list_agent_notifications`

### GitHub

- `get_github_git_credentials`

### MiniMax (requer chave API)

- `minimax_tts`
- `minimax_image`
- `minimax_video`

### Coolify

- `get_coolify_credentials`

### Schedules

- `list_self_crons`
- `manage_self_crons`
- `list_crons`
- `manage_crons`

### Capability management

- `list_agent_roles`
- `manage_agent_role`
- `change_agent_role`
- `list_agent_statuses`
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
