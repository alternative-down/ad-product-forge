# Current Data Model

This file documents the central application database defined in [schema.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/database/schema.ts).

## Core agent tables

### `agents`

Stores the persistent configuration of internal agents.

Important fields:

- `id`
- `name`
- `description`
- `functionId`
- `model`
- `omModel`
- `instructions`
- `executionState`
- `workspaceFilesystem`
- `workspaceSandbox`
- timestamps

### `agent_providers`

Stores encrypted provider credentials per agent.

This is the credential boundary for:

- internal chat
- Discord
- agent mailbox credentials
- GitHub app credentials
- other agent-bound provider credentials

This table is not a contact identity table.

### `agent_notifications`

Stores text notifications for agents.

Current shape:

- `id`
- `agentId`
- `content`
- `createdAt`
- `readAt`

The design is intentionally simple and source-agnostic.

### `agent_schedules`

Stores persisted schedules.

Important fields:

- `kind`
  - currently used to distinguish normal agent schedules from heartbeat schedules
- `scheduleType`
  - `cron` or `date`
- `cronExpression`
- `scheduledDate`
- `timezone`
- `content`
- `isActive`
- `lastTriggeredAt`
- `nextTriggerAt`

## Capability tables

### `agent_functions`

Organizational grouping assigned to each agent.

### `agent_roles`

Defines permission sets.

### `function_roles`

Maps one function to one role.

### `role_tool_permissions`

Stores literal custom tool ids allowed for a role.

### `role_workflow_permissions`

Stores literal workflow ids allowed for a role.

## Execution and finance tables

### `agent_execution_contracts`

Stores weekly operating contracts for agents.

### `agent_execution_steps`

Stores execution cost records for agent steps and observational memory steps.

### `llm_model_prices`

Stores token pricing used for execution accounting.

### `company_cash_ledger`

Stores company-level financial movements.

Current usage is minimal but real:

- company funding
- hiring cost recording
- contract-related financial reads

## Important current rule

The application database is the source of truth for company-level coordination.

Each agent also has its own workspace and local runtime storage, but those are not represented as separate company-level tables here.
