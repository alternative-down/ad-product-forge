# Configuração de Agentes

## Criar Agente

```bash
curl -X POST http://localhost:3000/admin/agent \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Dev Assistant",
    "roleId": "role-uuid",
    "workspacePath": "./workspaces/dev-assistant"
  }'
```

## Configurar Provider

### Discord

```bash
curl -X POST http://localhost:3000/admin/agent-provider/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "providerType": "discord",
    "credentials": {
      "token": "Bot xxx",
      "channels": [
        { "channelId": "123456789", "respondToMentionsOnly": false }
      ]
    }
  }'
```

### Email

```bash
curl -X POST http://localhost:3000/admin/agent-provider/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "providerType": "email",
    "credentials": {
      "imap": { "host": "imap.migadu.com", "port": 993, "user": "agent@domain.com", "password": "xxx" },
      "smtp": { "host": "smtp.migadu.com", "port": 465, "user": "agent@domain.com", "password": "xxx" }
    }
  }'
```

### Internal Chat

```bash
curl -X POST http://localhost:3000/admin/agent-provider/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "providerType": "internal-chat",
    "credentials": {
      "agentId": "agent-uuid"
    }
  }'
```

## Configurar Schedule

```bash
# A cada hora
curl -X POST http://localhost:3000/admin/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "scheduleType": "cron",
    "cronExpression": "0 * * * *",
    "isActive": true
  }'

# A cada 30 minutos
curl -X POST http://localhost:3000/admin/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "scheduleType": "interval",
    "intervalMs": 1800000,
    "isActive": true
  }'
```

## Configurar Contrato

```bash
curl -X POST http://localhost:3000/admin/finance/contract \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid",
    "budgetUsd": 1000.00,
    "startsAt": 1704067200000,
    "endsAt": 1706755200000
  }'
```

## Upload Skill

```bash
curl -X POST http://localhost:3000/admin/agent/{agentId}/skill \
  -H "Content-Type: multipart/form-data" \
  -F "file=@my-skill.zip"
```

## Operações

### Wake (forçar execução)

```bash
curl -X POST http://localhost:3000/admin/agent/{agentId}/wake
```

### Reload (recarregar runtime)

```bash
curl -X POST http://localhost:3000/admin/agent/{agentId}/reload
```

### Stop (pausar)

```bash
curl -X DELETE http://localhost:3000/admin/agent/{agentId}
```
