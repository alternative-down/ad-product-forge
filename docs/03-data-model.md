# Data Model

## Database

Drizzle ORM with SQLite (libsql/Turso). Schema defined in `apps/forge/src/database/schema.ts`.

## Tables

### agents

Persisted agents.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | Agent UUID |
| name | text | Agent name |
| roleId | text (FK) | Agent role |
| status | text | active, inactive, terminated |
| workspacePath | text | Workspace path |
| createdAt | integer | Creation timestamp |
| lastInitAt | integer | Last init |

### agent_roles

Roles defining capabilities and permissions.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | Role UUID |
| name | text | Role name |
| description | text | Description |
| agentToolPermissions | text | JSON with tool permissions |
| agentWorkflowPermissions | text | JSON with workflow permissions |

### agent_providers

Communication provider credentials.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| agentId | text (FK) | Owner agent |
| providerType | text | discord, internal-chat, email |
| encryptedCredentials | text | Encrypted credentials |

### agent_execution_contracts

Agent financial contracts.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| agentId | text (FK) | Owner agent |
| startsAt | integer | Start date |
| endsAt | integer | End date |
| budgetUsd | real | Budget in USD |
| status | text | active, paused, expired |

### agent_execution_steps

Execution step logs.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| contractId | text (FK) | Contract |
| agentId | text (FK) | Agent |
| llmProfileId | text | LLM profile used |
| stepType | text | Step type |
| inputTokens | integer | Input tokens |
| outputTokens | integer | Output tokens |
| durationMs | integer | Duration in ms |
| createdAt | integer | Timestamp |

### agent_home_metric_snapshots

Agent metric snapshots.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| agentId | text (FK) | Agent |
| stepId | text (FK) | Step |
| conversationCount | integer | Conversation count |
| messageCount | integer | Message count |

### agent_checkpointed_om_states

Checkpointed operational memory states.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| agentId | text (FK) | Agent |
| checkpointedOmTotalContextTokens | integer | Total context tokens |
| checkpointedOmRecentRawTokens | integer | Recent tokens |
| stateJson | text | Serialized state |

### schedules

Agent execution schedules.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| agentId | text (FK) | Agent |
| scheduleType | text | cron, interval, oneshot |
| cronExpression | text | Cron expression |
| intervalMs | integer | Interval in ms |
| nextStepAt | integer | Next step |
| isActive | integer | Is active |

### system_settings

Global system settings.

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| key | text | Setting key |
| value | text | Value |

## Relationships

```
agents 1──N agent_roles (roleId)
agents 1──N agent_providers
agents 1──N agent_execution_contracts
agents 1──N agent_execution_steps
agents 1──N agent_home_metric_snapshots
agents 1──N agent_checkpointed_om_states
agents 1──N schedules
agent_execution_contracts 1──N agent_execution_steps
```
