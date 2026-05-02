# Roles e Permissões

## Conceito

Um **role** define quais ferramentas e workflows um agente pode usar.

## Estrutura

```typescript
interface AgentRole {
  id: string;
  name: string;                         // "developer", "qa", "admin"
  description: string;
  agentToolPermissions: string[];       // Ferramentas permitidas
  agentWorkflowPermissions: string[];   // Workflows permitidos
}
```

## Tool Permissions

### GitHub

```
github.create-issue
github.list-issues
github.get-issue
github.update-issue
github.add-issue-comment
github.create-pull-request
github.list-pull-requests
github.get-pull-request
github.merge-pull-request
github.commit-file
github.create-repository
github.list-repositories
github.get-repository
github.create-label
github.create-milestone
```

### Coolify

```
coolify.list-applications
coolify.get-application
coolify.deploy-application
coolify.get-logs
coolify.update-environment-variables
```

### Discord

```
discord.send-message
discord.send-dm
```

### Email

```
email.send
email.list-messages
```

### Schedules

```
schedules.create
schedules.update
schedules.delete
```

### MCP

```
mcp.execute
```

## Workflow Permissions

```
workflow.hire-agent
workflow.terminate-agent
workflow.create-schedule
```

## Criar Role

```bash
curl -X POST http://localhost:3000/admin/role \
  -H "Content-Type: application/json" \
  -d '{
    "name": "developer",
    "description": "Desenvolvedor com acesso completo ao GitHub",
    "agentToolPermissions": [
      "github.create-issue",
      "github.create-pull-request",
      "github.commit-file",
      "github.merge-pull-request",
      "coolify.deploy-application"
    ],
    "agentWorkflowPermissions": []
  }'
```

## Roles Padrão

### developer

```json
{
  "name": "developer",
  "description": "Desenvolvedor full-stack",
  "agentToolPermissions": [
    "github.create-issue",
    "github.create-pull-request",
    "github.commit-file",
    "github.merge-pull-request",
    "github.create-repository",
    "github.list-repositories",
    "github.get-repository",
    "coolify.list-applications",
    "coolify.deploy-application",
    "coolify.get-logs",
    "coolify.update-environment-variables",
    "discord.send-message",
    "discord.send-dm",
    "email.send",
    "schedules.create",
    "schedules.update",
    "schedules.delete"
  ],
  "agentWorkflowPermissions": []
}
```

### qa

```json
{
  "name": "qa",
  "description": "QA engineer",
  "agentToolPermissions": [
    "github.list-issues",
    "github.get-pull-request",
    "github.add-issue-comment",
    "coolify.list-applications",
    "coolify.get-logs",
    "discord.send-message"
  ],
  "agentWorkflowPermissions": []
}
```

### readonly

```json
{
  "name": "readonly",
  "description": "Acesso de leitura",
  "agentToolPermissions": [
    "github.list-issues",
    "github.list-repositories",
    "github.get-repository",
    "coolify.list-applications"
  ],
  "agentWorkflowPermissions": []
}
```

## Verificar Permissão

```bash
curl http://localhost:3000/admin/role/{roleId}/permissions
```

## Adicionar Permissão

```bash
curl -X POST http://localhost:3000/admin/role/{roleId}/tool-permission \
  -H "Content-Type: application/json" \
  -d '{"toolId": "github.create-issue"}'
```

## Remover Permissão

```bash
curl -X DELETE http://localhost:3000/admin/role/{roleId}/tool-permission \
  -H "Content-Type: application/json" \
  -d '{"toolId": "github.create-issue"}'
```
