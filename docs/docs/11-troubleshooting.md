# Troubleshooting

## Problemas Comuns

### Agente não inicia

**Sintoma**: Agente fica em `absent` após hire.

**Causas possíveis**:

1. Credenciais inválidas no provider
2. Token Discord expirado
3. LLM API key inválida

**Solução**:

```bash
# Verificar logs
curl http://localhost:3000/admin/agent/:agentId/logs

# Testar provider
curl http://localhost:3000/admin/agent/:agentId/provider/test

# Atualizar credenciais
curl -X PUT http://localhost:3000/admin/agent-provider \
  -H "Content-Type: application/json" \
  -d '{"providerType": "discord", "credentials": {"token": "novo-token"}}'
```

### Discord provider não conecta

**Sintoma**: `Discord provider failed` no log.

**Causas possíveis**:

1. Token bot inválido
2. Intent não habilitado (Message Content Intent)
3. Rate limiting

**Solução**:

1. Verificar token em https://discord.com/developers
2. Habilitar Message Content Intent em Bot settings
3. Verificar rate limits em https://discord.status

### Schedule não executa

**Sintoma**: Agente não dispara nextStep.

**Causas possíveis**:

1. Schedule desativado (`isActive: false`)
2. `nextStepAt` no passado
3. Scheduler não está rodando

**Solução**:

```bash
# Verificar schedule
curl http://localhost:3000/admin/schedules?agentId=:agentId

# Reativar schedule
curl -X POST http://localhost:3000/admin/schedule/:scheduleId/toggle

# Resetar próximo step
curl -X PUT http://localhost:3000/admin/schedule/:scheduleId \
  -H "Content-Type: application/json" \
  -d '{"nextStepAt": null}' # próximo será agora + interval
```

### Budget esgotado

**Sintoma**: Agente para de executar, `budget_usd <= 0`.

**Solução**:

```bash
# Ver contrato
curl http://localhost:3000/admin/agent/:agentId/contract

# Adicionar budget
curl -X POST http://localhost:3000/admin/finance/top-up \
  -H "Content-Type: application/json" \
  -d '{"agentId": "uuid", "amountUsd": 500}'
```

### Provider loader falha silenciosamente

**Sintoma**: Agente não recebe mensagens mas não dá erro.

**Causa**: Credenciais inválidas com graceful degradation.

**Solução**:

```bash
# Testar todos os providers
curl http://localhost:3000/admin/agent/:agentId/providers

# Verificar token
echo "TOKEN_STATUS: OK" # testar manualmente no Discord
```

## Erros de Database

### Migration failed

**Sintoma**: `Migration failed: table already exists` ou similar.

**Solução**:

```bash
# Ver migrations pendentes
npm run db:status

# Resetar migrations (dev only)
rm -rf ./migrations/meta/*
npm run db:generate
npm run db:migrate
```

### Lock timeout

**Sintoma**: `Database is locked`.

**Causa**: Operações concorrentes no SQLite.

**Solução**:

```typescript
// Aguardar um pouco e retry
for (let i = 0; i < 3; i++) {
  try {
    await db.insert(agents).values({...});
    break;
  } catch (error) {
    if (error.message.includes('locked')) {
      await sleep(1000);
    } else {
      throw error;
    }
  }
}
```

## Erros de LLM

### Rate limit

**Sintoma**: `429 Too Many Requests`.

**Solução**:

- Implementar exponential backoff
- Verificar rate limits do provider
- Considerar modelo mais barato

### Context overflow

**Sintoma**: `Maximum context exceeded`.

**Solução**:

```typescript
// Reduzir tokens no checkpoint
// Ajustar checkpointedOmRecentRawTokens no system settings
curl -X PUT http://localhost:3000/admin/system/settings \
  -H "Content-Type: application/json" \
  -d '{"key": "checkpointing.om_recent_raw_tokens", "value": "5000"}'
```

### Invalid API key

**Sintoma**: `401 Unauthorized`.

**Solução**:

```bash
# Verificar key
echo $OPENAI_API_KEY | head -c 10

# Atualizar no .env
export OPENAI_API_KEY=sk-novo-token
```

## Erros de Integração

### GitHub token expired

**Sintoma**: `GitHub API: Token expired`.

**Solução**:

```bash
# Refresh installation token
curl -X POST http://localhost:3000/admin/github/refresh-token \
  -H "Content-Type: application/json" \
  -d '{"installationId": 123}'
```

### Coolify API unreachable

**Sintoma**: `ECONNREFUSED` ou timeout.

**Solução**:

1. Verificar se Coolify está online
2. Verificar URL da API
3. Verificar firewall

## Debugging

### Habilitar logs verbose

```bash
export LOG_LEVEL=debug
npm run dev
```

### Ver todos os logs de um agente

```bash
# Filtrar por agentId
grep "agent-uuid" logs/forge.log | tail -100

# Filtrar por scope
grep "scope: 'agent-runner'" logs/forge.log | tail -100
```

### Inspect registry

```typescript
// Via código
const registry = getInternalAgentRegistry();
const agents = registry.list();

console.log(
  'Agents:',
  agents.map((a) => ({
    id: a.runtime.id,
    status: a.runner.status,
  })),
);
```

### Testar provider manualmente

```typescript
const discord = createDiscordProvider({ token: 'xxx', channels: [] });
await discord.sendMessage({
  conversationKey: '123',
  content: 'test',
});
```

## Recovery Procedures

### Agente em loop infinito

**Sintoma**: Agente fica em `running` permanentemente.

**Solução**:

```bash
# Stop agent
curl -X POST http://localhost:3000/admin/agent/:agentId/stop

# Clear state
curl -X DELETE http://localhost:3000/admin/agent/:agentId/pending-messages

# Restart
curl -X POST http://localhost:3000/admin/agent/:agentId/wake
```

### Corromper LTM

**Sintoma**: Agente comportamento estranho, mensagens incoerentes.

**Solução**:

```bash
# Clear checkpointed state
curl -X DELETE http://localhost:3000/admin/agent/:agentId/om-state

# Rebuild from messages (manual)
# Desenvolvedor precisa inspecionar e corrigir
```

### Full disk

**Sintoma**: Sistema não responde.

**Solução**:

```bash
# Limpar workspaces antigos
rm -rf ./workspaces/*-archived

# Limpar logs antigos
find ./logs -mtime +30 -delete

# Limpar checkpoints antigos
# Via código ou script
```
