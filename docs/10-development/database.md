# Banco de Dados

## Schema

Drizzle ORM com SQLite (libsql/Turso).

```typescript
// apps/forge/src/database/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';
import { createId } from '../utils/id';

export const agents = sqliteTable('agents', {
  id: text('id').primaryKey().$defaultFn(() => createId()),
  name: text('name').notNull(),
  roleId: text('role_id').notNull(),
  status: text('status').notNull().default('active'),
  workspacePath: text('workspace_path').notNull(),
  createdAt: integer('created_at').notNull(),
  lastInitAt: integer('last_init_at'),
});
```

## Queries

```typescript
import { eq, and, desc, asc } from 'drizzle-orm';

// Select simples
const allAgents = await db.select().from(agents);

// Com WHERE
const activeAgents = await db.select().from(agents)
  .where(eq(agents.status, 'active'));

// Com ORDER BY
const recentSteps = await db.select().from(agentExecutionSteps)
  .where(eq(agentExecutionSteps.agentId, agentId))
  .orderBy(desc(agentExecutionSteps.createdAt))
  .limit(100);

// Com JOIN (usando SQL)
const agentWithRole = await db.execute(sql`
  SELECT a.*, r.name as role_name 
  FROM agents a 
  JOIN agent_roles r ON a.role_id = r.id 
  WHERE a.id = ${agentId}
`);
```

## Insert/Update/Delete

```typescript
// Insert
await db.insert(agents).values({
  id: createId(),
  name: 'New Agent',
  roleId: 'role-uuid',
  workspacePath: './workspaces/new',
  status: 'active',
  createdAt: Date.now(),
});

// Update
await db.update(agents)
  .set({ status: 'inactive', lastInitAt: Date.now() })
  .where(eq(agents.id, agentId));

// Delete
await db.delete(agents)
  .where(eq(agents.id, agentId));
```

## Transactions

```typescript
await db.transaction(async (tx) => {
  await tx.insert(agents).values({...});
  await tx.insert(schedules).values({...});
});
```

## Migrations

```bash
# Gerar migration
npm run db:generate

# Aplicar migrations
npm run db:migrate

# Ver status
npm run db:status

# Abrir Drizzle Studio
npm run db:studio
```

## Tables

### agents

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| name | text | Nome do agente |
| roleId | text | FK para roles |
| status | text | active/inactive/terminated |
| workspacePath | text | Caminho do workspace |
| createdAt | integer | Timestamp |
| lastInitAt | integer | Último init |

### agent_roles

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| name | text | Nome do role |
| description | text | Descrição |
| agentToolPermissions | text | JSON array |
| agentWorkflowPermissions | text | JSON array |

### agent_providers

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| agentId | text (FK) | Agente |
| providerType | text | discord/internal-chat/email |
| encryptedCredentials | text | Credenciais criptografadas |

### agent_execution_contracts

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| agentId | text (FK) | Agente |
| startsAt | integer | Início |
| endsAt | integer | Fim |
| budgetUsd | real | Orçamento |
| status | text | active/paused/expired |

### agent_execution_steps

| Column | Type | Description |
|--------|------|-------------|
| id | text (PK) | UUID |
| contractId | text (FK) | Contrato |
| agentId | text (FK) | Agente |
| llmProfileId | text | Perfil usado |
| stepType | text | Tipo do step |
| inputTokens | integer | Tokens entrada |
| outputTokens | integer | Tokens saída |
| durationMs | integer | Duração |
| createdAt | integer | Timestamp |
