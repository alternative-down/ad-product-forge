  createdAt: integer('created_at').notNull(),
});
```

### agent_home_metric_snapshots

```typescript
export const agentHomeMetricSnapshots = sqliteTable('agent_home_metric_snapshots', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  stepId: text('step_id').notNull(),
  conversationCount: integer('conversation_count').notNull(),
  messageCount: integer('message_count').notNull(),
  timestamp: integer('timestamp').notNull(),
});
```

### ledger

```typescript
export const ledger = sqliteTable('ledger', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),  // 'credit' | 'debit' | 'adjustment'
  amount: real('amount').notNull(),
  description: text('description'),
  createdAt: integer('created_at').notNull(),
});
```

## Relations

```typescript
// agents -> agent_roles
agents.roleId -> agent_roles.id

// agents -> schedules
agents.id -> schedules.agentId

// agents -> agent_providers
agents.id -> agent_providers.agentId

// agents -> agent_execution_contracts
agents.id -> agent_execution_contracts.agentId

// agents -> agent_execution_steps
agents.id -> agent_execution_steps.agentId

// agent_execution_contracts -> agent_execution_steps
agent_execution_contracts.id -> agent_execution_steps.contractId
```

## Indexes

```sql
-- Agentes por status
CREATE INDEX idx_agents_status ON agents(status);

-- Steps por agente
CREATE INDEX idx_steps_agent ON agent_execution_steps(agent_id);

-- Schedules por agente
CREATE INDEX idx_schedules_agent ON schedules(agent_id);

-- Providers por agente
CREATE INDEX idx_providers_agent ON agent_providers(agent_id);
```
