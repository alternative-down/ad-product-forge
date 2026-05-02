# Rotas de Sistema

## Health Check

```bash
GET /admin/system/health
```

**Resposta:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "components": {
    "database": "connected",
    "discord": "connected",
    "internalChat": "connected"
  }
}
```

## Listar Settings

```bash
GET /admin/system/settings
```

**Resposta:**
```json
{
  "settings": [
    {
      "key": "llm.default_model",
      "value": "gpt-4"
    }
  ]
}
```

## Atualizar Setting

```bash
PUT /admin/system/settings
```

**Body:**
```json
{
  "key": "llm.default_model",
  "value": "gpt-4-turbo"
}
```

## Agent Provider Upsert

```bash
POST /admin/agent-provider/upsert
```

**Body:**
```json
{
  "agentId": "agent-uuid",
  "providerType": "discord",
  "credentials": {
    "token": "Bot xxx",
    "channels": [...]
  }
}
```

## Agent Provider Remove

```bash
DELETE /admin/agent-provider
```

**Body:**
```json
{
  "agentId": "agent-uuid",
  "providerType": "discord"
}
```

## MCP Server

```bash
POST /admin/mcp-server
PUT /admin/mcp-server/:serverId
DELETE /admin/mcp-server
PUT /admin/mcp-server/:serverId/active
```

## Upload Skill

```bash
POST /admin/agent/:agentId/skill
Content-Type: multipart/form-data
file: @skill.zip
```
