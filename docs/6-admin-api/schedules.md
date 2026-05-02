# Rotas de Schedules

## Listar Schedules

```bash
GET /admin/schedules
GET /admin/schedules?agentId=:agentId
```

**Resposta:**
```json
{
  "schedules": [
    {
      "id": "schedule-uuid",
      "agentId": "agent-uuid",
      "scheduleType": "cron",
      "cronExpression": "0 * * * *",
      "nextStepAt": 1704067200000,
      "isActive": true
    }
  ]
}
```

## Criar Schedule

```bash
POST /admin/schedule
```

**Body:**
```json
{
  "agentId": "agent-uuid",
  "scheduleType": "cron",
  "cronExpression": "0 * * * *",
  "isActive": true
}
```

### Tipos de Schedule

```json
// Cron
{
  "scheduleType": "cron",
  "cronExpression": "0 * * * *"
}

// Interval
{
  "scheduleType": "interval",
  "intervalMs": 3600000
}

// Oneshot
{
  "scheduleType": "oneshot",
  "nextStepAt": 1704067200000
}
```

## Atualizar Schedule

```bash
PUT /admin/schedule/:scheduleId
```

**Body:**
```json
{
  "cronExpression": "*/30 * * * *"
}
```

## Remover Schedule

```bash
DELETE /admin/schedule
```

**Body:**
```json
{
  "scheduleId": "schedule-uuid"
}
```

## Toggle Schedule

```bash
POST /admin/schedule/:scheduleId/toggle
```

Alterna entre ativo/inativo.
