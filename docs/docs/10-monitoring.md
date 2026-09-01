# Monitoramento e Observabilidade

## Overview

O Forge oferece mecanismos de monitoramento para acompanhar a saúde do sistema e dos agentes.

## Health Check

```bash
# Health check básico
curl http://localhost:3000/admin/system/health

# Resposta
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "components": {
    "database": "connected",
    "discord": "connected",
    "internalChat": "connected"
  }
}
```

## Agente Status

```bash
# Status de um agente
curl http://localhost:3000/admin/agent/:agentId/status

# Resposta
{
  "agentId": "uuid",
  "status": "idle" | "running" | "absent",
  "lastStepAt": "2024-01-15T10:30:00Z",
  "nextStepAt": "2024-01-15T11:00:00Z",
  "activeSchedule": "cron: 0 * * * *"
}
```

## Execution Metrics

### Overview Dashboard

```bash
GET /admin/overview

{
  "totalAgents": 5,
  "activeAgents": 3,
  "idleAgents": 1,
  "absentAgents": 1,
  "totalContracts": 5,
  "totalBudgetUsd": 5000.00,
  "usedBudgetUsd": 1234.56
}
```

### Agent Metrics

```bash
GET /admin/agent/:agentId/metrics

{
  "agentId": "uuid",
  "contract": {
    "budgetUsd": 1000.00,
    "usedUsd": 234.56,
    "remainingUsd": 765.44,
    "startsAt": "2024-01-01",
    "endsAt": "2024-01-31"
  },
  "steps": {
    "total": 150,
    "today": 12,
    "avgDurationMs": 3000
  },
  "messages": {
    "total": 450,
    "today": 30
  }
}
```

## Execution Steps Log

```typescript
// Via API
GET /admin/agent/:agentId/steps?limit=100&offset=0

// Via código
import { agentExecutionSteps } from '../database/schema';

const steps = await db.select().from(agentExecutionSteps)
  .where(eq(agentExecutionSteps.agentId, agentId))
  .orderBy(desc(agentExecutionSteps.createdAt))
  .limit(100);
```

### Step Fields

| Campo          | Descrição         |
| -------------- | ----------------- |
| `id`           | UUID do step      |
| `contractId`   | Contrato usado    |
| `llmProfileId` | Perfil LLM        |
| `stepType`     | tipo do step      |
| `inputTokens`  | Tokens de entrada |
| `outputTokens` | Tokens de saída   |
| `durationMs`   | Duração           |
| `createdAt`    | Timestamp         |

## Log de Mensagens

```bash
# Conversations de um agente
GET /admin/agent/:agentId/conversations?limit=50

# Mensagens de uma conversation
GET /admin/conversation/:conversationKey/messages?limit=100
```

## Memory Snapshots

```bash
# Home metrics snapshots
GET /admin/agent/:agentId/metric-snapshots?limit=100

# Checkpointed OM states
GET /admin/agent/:agentId/om-states?limit=10
```

## Finance Monitoring

```bash
# Overview financeiro
GET /admin/finance/overview

{
  "balance": 5000.00,
  "totalPayables": 2000.00,
  "recentMovements": [
    {
      "id": "uuid",
      "type": "credit",
      "amount": 500.00,
      "description": "Top-up",
      "createdAt": "2024-01-15"
    }
  ],
  "recurringPayables": [
    {
      "id": "uuid",
      "description": "AWS",
      "amount": 200.00,
      "frequency": "monthly",
      "nextDueDate": "2024-02-01",
      "isActive": true
    }
  ]
}
```

## Alerting

### Via Logs

O sistema loga eventos importantes via `forgeDebug`:

```typescript
// Agente começando step
forgeDebug({
  scope: 'agent-runner',
  level: 'info',
  message: 'executing step',
  context: { runtimeId: agentId },
});

// Erro de healthcheck
forgeDebug({
  scope: 'agent-runner',
  level: 'error',
  message: 'healthcheck failed',
  context: { error },
});

// Budget crítico
forgeDebug({
  scope: 'finance',
  level: 'warn',
  message: 'Budget low',
  context: { agentId, remainingUsd },
});
```

### Custom Monitoring

```typescript
// Hook para monitorar budget
const budgetAlerts = await db
  .select()
  .from(agentExecutionContracts)
  .where(
    and(
      eq(agentExecutionContracts.status, 'active'),
      lt(agentExecutionContracts.budgetUsd, 100), // < $100 remaining
    ),
  );
```

## Metrics Collection

### Agent Home Metrics

```typescript
// Snapshots automáticos a cada hora
import { agentHomeMetricSnapshots } from '../database/schema';

// Criar snapshot
await db.insert(agentHomeMetricSnapshots).values({
  id: createId(),
  agentId,
  stepId,
  conversationCount: 10,
  messageCount: 50,
  timestamp: Date.now(),
});
```

## Dashboard Metrics

| Métrica         | Descrição             | Frequência |
| --------------- | --------------------- | ---------- |
| `totalAgents`   | Count de agentes      | real-time  |
| `activeAgents`  | Agentes em execução   | real-time  |
| `steps`         | Steps executados      | real-time  |
| `tokens`        | Tokens consumidos     | real-time  |
| `budget`        | Budget usado/restante | real-time  |
| `conversations` | Mensagens processadas | real-time  |
