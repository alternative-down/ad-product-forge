# API Admin - Visão Geral

## Endpoint Base

```
http://localhost:3000/admin
```

## Autenticação

A API admin não requer autenticação por padrão em desenvolvimento. Em produção, configure autenticação.

## Formato de Requisição

```bash
curl -X METHOD http://localhost:3000/admin/PATH \
  -H "Content-Type: application/json" \
  -d '{ "body": "json" }'
```

## Formato de Resposta

### Sucesso

```typescript
{
  "status": 200,
  "body": {
    "data": { ... }
  }
}
```

### Erro

```typescript
{
  "status": 400,
  "body": {
    "error": "Error message"
  }
}
```

## Rotas Disponíveis

| Rota | Método | Descrição |
|------|--------|-----------|
| `/admin/agent` | GET, POST | Listar/criar agentes |
| `/admin/agent/:agentId` | GET, PUT, DELETE | Detalhes/atualizar/remover agente |
| `/admin/agent/:agentId/wake` | POST | Forçar execução |
| `/admin/agent/:agentId/reload` | POST | Recarregar runtime |
| `/admin/schedule` | GET, POST | Listar/criar schedule |
| `/admin/schedule/:scheduleId` | PUT, DELETE | Atualizar/remover schedule |
| `/admin/schedule/:scheduleId/toggle` | POST | Ativar/desativar schedule |
| `/admin/role` | GET, POST | Listar/criar role |
| `/admin/role/:roleId` | GET, PUT, DELETE | Detalhes/atualizar/remover role |
| `/admin/role/:roleId/tool-permission` | POST, DELETE | Adicionar/remover permission |
| `/admin/finance/overview` | GET | Visão geral financeira |
| `/admin/finance/ledger-entry` | POST | Criar ledger entry |
| `/admin/finance/contract` | POST | Criar contrato |
| `/admin/system/health` | GET | Health check |
| `/admin/system/settings` | GET, PUT | Settings do sistema |

## Validação

Todas as requisições são validadas com Zod schemas. Se a validação falhar, retorna 400.

## Rate Limiting

Não há rate limiting configurado por padrão.

## CORS

CORS está configurado para permitir requests de origens específicas.
