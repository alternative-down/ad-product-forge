# Integrações de Sistema

## SystemIntegrationStore

Store unificado para configurações de integração.

```typescript
const { createSystemIntegrationStore } = await import('./integrations/store');

const integrations = createSystemIntegrationStore(db);

// Listar por tipo
const coolifyIntegrations = integrations.listByType('coolify');
const githubIntegrations = integrations.listByType('github');

// Atualizar
await integrations.updateByType('coolify', {
  adminToken: 'token',
  webhookSecret: 'secret',
});
```

## Tipos de Integração

| Tipo | Descrição |
|------|-----------|
| `coolify` | Deploy management |
| `github` | GitHub Apps |
| `migadu` | Email |
| `minimax` | LLM provider |

## Configurar Integração

```bash
curl -X PUT http://localhost:3000/admin/system/integration \
  -H "Content-Type: application/json" \
  -d '{
    "type": "coolify",
    "config": {
      "apiKey": "xxx",
      "baseUrl": "https://coolify.example.com"
    }
  }'
```
