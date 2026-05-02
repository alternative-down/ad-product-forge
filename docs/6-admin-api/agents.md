# Rotas de Agentes

## Listar Agentes

```bash
GET /admin/agent
```

**Resposta:**
```json
{
  "agents": [
    {
      "id": "uuid",
      "name": "Agent Name",
      "roleId": "role-uuid",
      "status": "active",
      "workspacePath": "./workspaces/agent"
    }
  ]
}
```

## Criar Agente

```bash
POST /admin/agent
```

**Body:**
```json
{
  "name": "New Agent",
  "roleId": "role-uuid",
  "workspacePath": "./workspaces/new-agent"
}
```

**Resposta:**
```json
{
  "id": "agent-uuid",
  "name": "New Agent",
  "roleId": "role-uuid",
  "status": "active",
  "workspacePath": "./workspaces/new-agent"
}
```

## Obter Agente

```bash
GET /admin/agent/:agentId
```

**Resposta:**
```json
{
  "agent": { ... },
  "role": { ... },
  "contract": { ... },
  "providers": [ ... ],
  "schedule": { ... },
  "runtimeStatus": "idle"
}
```

## Atualizar Agente

```bash
PUT /admin/agent/:agentId
```

**Body:**
```json
{
  "name": "Updated Name"
}
```

## Remover Agente

```bash
DELETE /admin/agent/:agentId
```

**Nota:** Isso encerra o agente (terminated), não deleta permanentemente.

## Forçar Execução (Wake)

```bash
POST /admin/agent/:agentId/wake
```

Dispara a execução imediatamente, ignorando o schedule.

## Recarregar Runtime

```bash
POST /admin/agent/:agentId/reload
```

Recarrega o runtime do agente (recarrega credenciais, providers).
