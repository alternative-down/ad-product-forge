# Admin API

## Visão Geral

A Admin API é uma REST API exposta pelo Forge para gestão do sistema. Implementada em `apps/forge/src/admin/routes.ts`.

## Rotas

### Agentes

| Método | Path                  | Descrição          |
| ------ | --------------------- | ------------------ |
| GET    | /admin/agent          | Lista agentes      |
| GET    | /admin/agent/:agentId | Detalhes do agente |
| POST   | /admin/agent          | Cria novo agente   |
| PUT    | /admin/agent/:agentId | Atualiza agente    |
| DELETE | /admin/agent/:agentId | Remove agente      |

### Providers

| Método | Path                         | Descrição              |
| ------ | ---------------------------- | ---------------------- |
| POST   | /admin/agent-provider/upsert | Cria/atualiza provider |
| DELETE | /admin/agent-provider        | Remove provider        |

### MCP Servers

| Método | Path                               | Descrição           |
| ------ | ---------------------------------- | ------------------- |
| POST   | /admin/mcp-server                  | Cria MCP server     |
| PUT    | /admin/mcp-server/:serverId        | Atualiza MCP server |
| DELETE | /admin/mcp-server                  | Remove MCP server   |
| PUT    | /admin/mcp-server/:serverId/active | Ativa/desativa      |

### Schedules

| Método | Path                               | Descrição         |
| ------ | ---------------------------------- | ----------------- |
| GET    | /admin/schedules                   | Lista schedules   |
| POST   | /admin/schedule                    | Cria schedule     |
| PUT    | /admin/schedule/:scheduleId        | Atualiza schedule |
| DELETE | /admin/schedule                    | Remove schedule   |
| POST   | /admin/schedule/:scheduleId/toggle | Toggle active     |

### Roles

| Método | Path                                | Descrição                |
| ------ | ----------------------------------- | ------------------------ |
| GET    | /admin/roles                        | Lista roles              |
| POST   | /admin/role                         | Cria role                |
| PUT    | /admin/role/:roleId                 | Atualiza role            |
| DELETE | /admin/role/:roleId                 | Remove role              |
| POST   | /admin/role/:roleId/tool-permission | Adiciona tool permission |
| DELETE | /admin/role/:roleId/tool-permission | Remove tool permission   |

### Skills

| Método | Path                        | Descrição           |
| ------ | --------------------------- | ------------------- |
| POST   | /admin/agent/:agentId/skill | Faz upload de skill |

### Operations

| Método | Path                         | Descrição              |
| ------ | ---------------------------- | ---------------------- |
| POST   | /admin/agent/:agentId/wake   | Dispara wake do agente |
| POST   | /admin/agent/:agentId/reload | Recarrega runtime      |

### Finance

| Método | Path                                        | Descrição               |
| ------ | ------------------------------------------- | ----------------------- |
| GET    | /admin/finance/overview                     | Overview financeiro     |
| POST   | /admin/finance/ledger-entry                 | Cria ledger entry       |
| POST   | /admin/finance/recurring-payable            | Cria payable recorrente |
| PUT    | /admin/finance/recurring-payable/:id        | Atualiza payable        |
| POST   | /admin/finance/recurring-payable/:id/toggle | Toggle payable          |

### System

| Método | Path                   | Descrição        |
| ------ | ---------------------- | ---------------- |
| GET    | /admin/system/health   | Health check     |
| GET    | /admin/system/settings | Lista settings   |
| PUT    | /admin/system/settings | Atualiza setting |

## Read Models

Read models são queries pré-definidas para obter dados agregados.

### Dashboard Overview

```typescript
GET / admin / overview;
{
  totalAgents: number;
  activeAgents: number;
  totalContracts: number;
  totalBudget: number;
}
```

### Agent Details

```typescript
GET /admin/agent/:agentId
{
  agent: Agent;
  role: AgentRole;
  contract: AgentExecutionContract;
  providers: AgentProvider[];
  schedule: Schedule | null;
  runtimeStatus: 'idle' | 'running' | 'absent';
}
```

### Finance Overview

```typescript
GET /admin/finance/overview
{
  balance: number;
  totalPayables: number;
  recentMovements: LedgerEntry[];
  recurringPayables: RecurringPayable[];
}
```

## Validação

Todas as requisições são validadas com Zod schemas.

Exemplo:

```typescript
const upsertAgentSchema = z.object({
  agentId: z.string().min(1).optional(),
  name: z.string().min(1),
  roleId: z.string().min(1),
  workspacePath: z.string().min(1),
});
```

## Response Format

```typescript
interface JsonResponse {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}
```

Sucesso: `{ status: 200, body: { data } }`
Erro: `{ status: 400|404|500, body: { error: string } }`
