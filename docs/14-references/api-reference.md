# Referência da API

## Base URL

```
http://localhost:3000/admin
```

## Agent Routes

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /admin/agent | Criar agente |
| GET | /admin/agent | Listar agentes |
| GET | /admin/agent/:agentId | Obter agente |
| PUT | /admin/agent/:agentId | Atualizar agente |
| DELETE | /admin/agent/:agentId | Remover agente |
| POST | /admin/agent/:agentId/wake | Forçar execução |
| POST | /admin/agent/:agentId/reload | Recarregar runtime |

## Schedule Routes

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /admin/schedule | Criar schedule |
| GET | /admin/schedules | Listar schedules |
| PUT | /admin/schedule/:scheduleId | Atualizar schedule |
| DELETE | /admin/schedule | Remover schedule |
| POST | /admin/schedule/:scheduleId/toggle | Toggle active |

## Role Routes

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /admin/role | Criar role |
| GET | /admin/roles | Listar roles |
| GET | /admin/role/:roleId | Obter role |
| PUT | /admin/role/:roleId | Atualizar role |
| DELETE | /admin/role/:roleId | Remover role |
| POST | /admin/role/:roleId/tool-permission | Adicionar permission |
| DELETE | /admin/role/:roleId/tool-permission | Remover permission |

## Finance Routes

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /admin/finance/overview | Visão geral |
| POST | /admin/finance/ledger-entry | Criar ledger entry |
| POST | /admin/finance/contract | Criar contrato |
| POST | /admin/finance/recurring-payable | Criar recurring payable |
| PUT | /admin/finance/recurring-payable/:id | Atualizar payable |
| POST | /admin/finance/recurring-payable/:id/toggle | Toggle payable |

## System Routes

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | /admin/system/health | Health check |
| GET | /admin/system/settings | Listar settings |
| PUT | /admin/system/settings | Atualizar setting |
| GET | /admin/overview | Dashboard overview |

## Provider Routes

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /admin/agent-provider/upsert | Upsert provider |
| DELETE | /admin/agent-provider | Remover provider |

## MCP Routes

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /admin/mcp-server | Criar MCP server |
| PUT | /admin/mcp-server/:serverId | Atualizar server |
| DELETE | /admin/mcp-server | Remover server |
| PUT | /admin/mcp-server/:serverId/active | Toggle active |

## Email Routes

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /admin/email/provision | Provisionar mailbox |

## Internal Chat Routes

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /admin/internal-chat/group | Criar grupo |
| GET | /admin/internal-chat/groups | Listar grupos |
| POST | /admin/internal-chat/group/:groupId/participant | Adicionar participante |
| DELETE | /admin/internal-chat/group/:groupId/participant | Remover participante |

## Skill Routes

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | /admin/agent/:agentId/skill | Upload skill |
| DELETE | /admin/agent/:agentId/skill/:skillId | Remover skill |
