# Criando seu Primeiro Agente

Este guia explica como criar e configurar seu primeiro agente no Forge.

## Passo 1: Criar o Role

Primeiro, crie um role que define as permissões do agente.

```bash
curl -X POST http://localhost:3000/admin/role \
  -H "Content-Type: application/json" \
  -d '{
    "name": "assistant",
    "description": "Agente assistente básico",
    "agentToolPermissions": [
      "github.create-issue",
      "github.list-issues"
    ],
    "agentWorkflowPermissions": []
  }'
```

Resposta:
```json
{
  "id": "role-uuid-here",
  "name": "assistant",
  "description": "Agente assistente básico",
  "agentToolPermissions": ["github.create-issue", "github.list-issues"],
  "agentWorkflowPermissions": []
}
```

Guarde o `id` do role — você precisará dele.

## Passo 2: Criar o Workspace

Crie um diretório para o workspace do agente.

```bash
mkdir -p workspaces/meu-primeiro-agente
```

## Passo 3: Criar o Agente

Agora crie o agente usando a API.

```bash
curl -X POST http://localhost:3000/admin/agent \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Meu Primeiro Agente",
    "roleId": "role-uuid-here",
    "workspacePath": "./workspaces/meu-primeiro-agente"
  }'
```

Resposta:
```json
{
  "id": "agent-uuid-here",
  "name": "Meu Primeiro Agente",
  "roleId": "role-uuid-here",
  "status": "active",
  "workspacePath": "./workspaces/meu-primeiro-agente"
}
```

## Passo 4: Configurar Provider (Discord)

Se quiser que o agente responda no Discord:

```bash
curl -X POST http://localhost:3000/admin/agent-provider/upsert \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid-here",
    "providerType": "discord",
    "credentials": {
      "token": "SEU_BOT_TOKEN",
      "channels": [
        { "channelId": "123456789", "respondToMentionsOnly": true }
      ]
    }
  }'
```

## Passo 5: Criar Schedule

Defina quando o agente deve executar.

```bash
curl -X POST http://localhost:3000/admin/schedule \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid-here",
    "scheduleType": "cron",
    "cronExpression": "0 * * * *",
    "isActive": true
  }'
```

Este schedule faz o agente executar a cada hora.

## Passo 6: Criar Contrato

Defina o orçamento do agente.

```bash
curl -X POST http://localhost:3000/admin/finance/contract \
  -H "Content-Type: application/json" \
  -d '{
    "agentId": "agent-uuid-here",
    "budgetUsd": 100.00,
    "startsAt": '$(date +%s000)',
    "endsAt": '$(date -d "+30 days" +%s000)'
  }'
```

## Passo 7: Verificar Agente

Verifique se o agente foi criado corretamente.

```bash
curl http://localhost:3000/admin/agent/agent-uuid-here
```

Você deve ver os detalhes do agente.

## Estrutura Completa

```
1. Criar Role (define permissões)
   ↓
2. Criar Workspace (diretório do agente)
   ↓
3. Criar Agent (entidade principal)
   ↓
4. Configurar Provider (como se comunica)
   ↓
5. Criar Schedule (quando executa)
   ↓
6. Criar Contract (orçamento)
```

## Código Completo

```bash
#!/bin/bash

# Variáveis
AGENT_NAME="Meu Primeiro Agente"
WORKSPACE_PATH="./workspaces/meu-primeiro-agente"

# 1. Criar role
ROLE_RESPONSE=$(curl -s -X POST http://localhost:3000/admin/role \
  -H "Content-Type: application/json" \
  -d '{
    "name": "basic-assistant",
    "description": "Assistente básico",
    "agentToolPermissions": ["github.create-issue", "github.list-issues"],
    "agentWorkflowPermissions": []
  }')
ROLE_ID=$(echo $ROLE_RESPONSE | jq -r '.id')

# 2. Criar workspace
mkdir -p $WORKSPACE_PATH

# 3. Criar agente
AGENT_RESPONSE=$(curl -s -X POST http://localhost:3000/admin/agent \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$AGENT_NAME\",
    \"roleId\": \"$ROLE_ID\",
    \"workspacePath\": \"$WORKSPACE_PATH\"
  }")
AGENT_ID=$(echo $AGENT_RESPONSE | jq -r '.id')

echo "Agente criado com ID: $AGENT_ID"
echo "Role criado com ID: $ROLE_ID"
```

## Verificar Execução

Depois de alguns minutos, verifique se o agente está executando:

```bash
# Ver status do agente
curl http://localhost:3000/admin/agent/$AGENT_ID/status

# Ver steps executados
curl http://localhost:3000/admin/agent/$AGENT_ID/steps?limit=10

# Ver métricas
curl http://localhost:3000/admin/agent/$AGENT_ID/metrics
```

## Troubleshooting

### Agente não aparece

```bash
# Ver todos os agentes
curl http://localhost:3000/admin/agent

# Ver logs
curl http://localhost:3000/admin/system/logs
```

### Schedule não executa

```bash
# Ver schedules
curl http://localhost:3000/admin/schedules?agentId=$AGENT_ID

# Verificar se está ativo
curl -X POST http://localhost:3000/admin/schedule/$SCHEDULE_ID/toggle
```

## Próximos Passos

- [Sistema de Memória](../4-agents/memory.md) - Entenda como o agente armazena informações
- [Provider Discord](../5-communication/discord.md) - Configure comunicação Discord
- [Ferramentas GitHub](../9-tools/github.md) - Use ferramentas do GitHub
