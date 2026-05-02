# Rotas de Roles

## Listar Roles

```bash
GET /admin/roles
```

**Resposta:**
```json
{
  "roles": [
    {
      "id": "role-uuid",
      "name": "developer",
      "description": "Desenvolvedor",
      "agentToolPermissions": ["github.create-issue"],
      "agentWorkflowPermissions": []
    }
  ]
}
```

## Criar Role

```bash
POST /admin/role
```

**Body:**
```json
{
  "name": "developer",
  "description": "Desenvolvedor com acesso ao GitHub",
  "agentToolPermissions": [
    "github.create-issue",
    "github.create-pull-request",
    "github.commit-file"
  ],
  "agentWorkflowPermissions": []
}
```

## Obter Role

```bash
GET /admin/role/:roleId
```

## Atualizar Role

```bash
PUT /admin/role/:roleId
```

**Body:**
```json
{
  "name": "updated-name",
  "description": "Nova descrição"
}
```

## Remover Role

```bash
DELETE /admin/role/:roleId
```

**Nota:** Não pode remover se houver agentes usando.

## Adicionar Tool Permission

```bash
POST /admin/role/:roleId/tool-permission
```

**Body:**
```json
{
  "toolId": "github.create-issue"
}
```

## Remover Tool Permission

```bash
DELETE /admin/role/:roleId/tool-permission
```

**Body:**
```json
{
  "toolId": "github.create-issue"
}
```
