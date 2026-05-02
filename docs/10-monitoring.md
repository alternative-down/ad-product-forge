# Monitoring

## Overview

Forge provides monitoring mechanisms to track system and agent health.

## Health Check

```bash
curl http://localhost:3000/admin/system/health
# Response
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

## Agent Status

```bash
curl http://localhost:3000/admin/agent/:agentId/status
# Response
{
  "agentId": "uuid",
  "status": "idle" | "running" | "absent",
  "lastStepAt": "2024-01-15T10:30:00Z",
  "nextStepAt": "2024-01-15T11:00:00Z"
}
```

## Metrics

### Dashboard Overview

```bash
GET /admin/overview
{
  "totalAgents": 5,
  "activeAgents": 3,
  "idleAgents": 1,
  "absentAgents": 1,
  "totalContracts": 5,
  "totalBudgetUsd": 5000.00
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
  }
}
```

## Execution Steps Log

```typescript
const steps = await db.select().from(agentExecutionSteps)
  .where(eq(agentExecutionSteps.agentId, agentId))
  .orderBy(desc(agentExecutionSteps.createdAt))
  .limit(100);
```

### Step Fields

| Field | Description |
|-------|-------------|
| `id` | Step UUID |
| `contractId` | Contract used |
| `llmProfileId` | LLM profile |
| `stepType` | Step type |
| `inputTokens` | Input tokens |
| `outputTokens` | Output tokens |
| `durationMs` | Duration |
| `createdAt` | Timestamp |

## Logging

`forgeDebug` for all logging:

```typescript
// Agent starting step
forgeDebug({ scope: 'agent-runner', level: 'info', message: 'executing step', context: { runtimeId: agentId } });

// Healthcheck error
forgeDebug({ scope: 'agent-runner', level: 'error', message: 'healthcheck failed', context: { error } });

// Budget critical
forgeDebug({ scope: 'finance', level: 'warn', message: 'Budget low', context: { agentId, remainingUsd } });
```

## Metrics Collection

```typescript
import { agentHomeMetricSnapshots } from '../database/schema';

// Create snapshot
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

| Metric | Description |
|--------|-------------|
| `totalAgents` | Agent count |
| `activeAgents` | Running agents |
| `steps` | Executed steps |
| `tokens` | Consumed tokens |
| `budget` | Used/remaining budget |
| `conversations` | Processed messages |
