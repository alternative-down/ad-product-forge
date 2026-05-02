# Configuração

## Variáveis de Ambiente

### Obrigatórias

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `ENCRYPTION_KEY` | Chave AES-256 para criptografia (base64, 32 bytes) | `openssl rand -base64 32` |
| `DATABASE_URL` | URL do banco libsql | `file:./data/forge.db` ou `libsql://xxx.turso.io` |
| `FORGE_DATA_PATH` | Diretório de dados | `./data` (default) |
| `WORKSPACE_BASE_PATH` | Diretório dos workspaces dos agentes | `./workspaces` (default) |

### Opcionais

| Variável | Descrição | Default |
|----------|-----------|---------|
| `HTTP_PORT` | Porta do servidor HTTP | `3000` |
| `HTTP_HOST` | Host do servidor | `0.0.0.0` |
| `LOG_LEVEL` | Nível de log (debug, info, warn, error) | `info` |

### LLM Providers

```bash
# OpenAI
OPENAI_API_KEY=sk-...

# MiniMax
MINIMAX_API_KEY=xxx
MINIMAX_GROUP_ID=xxx

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
```

### Integrations

```bash
# Coolify
COOLIFY_API_KEY=xxx
COOLIFY_BASE_URL=https://coolify.example.com

# Migadu (Email)
MIGADU_API_KEY=xxx
MIGADU_API_BASE_URL=https://api.migadu.com
MIGADU_DOMAIN=example.com

# GitHub (App credentials)
GITHUB_APP_ID=xxx
GITHUB_APP_PRIVATE_KEY=xxx
GITHUB_APP_INSTALLATION_ID=xxx
```

## Schema de Configuração

```typescript
// apps/forge/src/main.ts
const env = envSchema.parse(process.env);

interface EnvSchema {
  ENCRYPTION_KEY: string;
  DATABASE_URL: string;
  FORGE_DATA_PATH: string;
  WORKSPACE_BASE_PATH: string;
  HTTP_PORT: number;
  HTTP_HOST: string;
  
  // LLM
  OPENAI_API_KEY?: string;
  MINIMAX_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  
  // Integrations
  COOLIFY_API_KEY?: string;
  COOLIFY_BASE_URL?: string;
  MIGADU_API_KEY?: string;
  MIGADU_API_BASE_URL?: string;
}
```

## Gerenciamento de Credenciais

### Criptografia

Todas as credenciais são criptografadas com AES-GCM:

```typescript
import { encryptSecret, decryptSecret } from './encryption/crypto';

// Criptografar antes de salvar no banco
const encrypted = encryptSecret(JSON.stringify(credentials));

// Descriptografar para usar
const credentials = JSON.parse(decryptSecret(encrypted));
```

### Provider Credentials

```typescript
// Discord
{
  token: "Bot xxx",
  channels: [
    { channelId: "123", respondToMentionsOnly: false }
  ]
}

// Email
{
  imap: {
    host: "imap.migadu.com",
    port: 993,
    user: "agent@example.com",
    password: "xxx"
  },
  smtp: {
    host: "smtp.migadu.com",
    port: 465,
    user: "agent@example.com",
    password: "xxx"
  }
}

// Internal Chat
{
  agentId: "agent-uuid"
}
```

## System Settings

Configurações globais via API:

```bash
# Obter settings
curl http://localhost:3000/admin/system/settings

# Atualizar setting
curl -X PUT http://localhost:3000/admin/system/settings \
  -H "Content-Type: application/json" \
  -d '{"key": "llm.default_model", "value": "gpt-4"}'
```

Settings disponíveis:

| Key | Tipo | Descrição |
|-----|------|-----------|
| `llm.default_model` | string | Modelo LLM default |
| `llm.observation_previous_observer_tokens` | number | Tokens para observação anterior |
| `checkpointing.om_recent_raw_tokens` | number | Tokens recentes no checkpoint |

## LLM Profiles

Perfis de configuração de modelos LLM:

```typescript
interface LlmProfile {
  id: string;
  name: string;
  provider: 'openai' | 'minimax' | 'anthropic';
  model: string;
  temperature: number;
  maxTokens: number;
}

// Criar via API
POST /admin/llm-profile
{
  "name": "primary",
  "provider": "openai",
  "model": "gpt-4",
  "temperature": 0.7,
  "maxTokens": 4096
}
```

Perfis especiais:
- `primary` — usado para execuções normais
- `om` — usado para Operational Memory

## Roles e Permissions

### Criar Role

```bash
curl -X POST http://localhost:3000/admin/role \
  -H "Content-Type: application/json" \
  -d '{
    "name": "developer",
    "description": "Desenvolvedor com acesso ao GitHub",
    "agentToolPermissions": [
      "github.create-issue",
      "github.create-pull-request",
      "github.commit-file"
    ],
    "agentWorkflowPermissions": []
  }'
```

### Tool Permissions

Tools disponíveis:

```
github.create-issue
github.create-pull-request
github.commit-file
github.merge-pull-request
github.create-repository
github.list-repositories
github.get-repository
coolify.list-applications
coolify.deploy-application
coolify.get-logs
coolify.update-environment-variables
discord.send-message
discord.send-dm
email.send
email.list-messages
schedules.create
schedules.update
schedules.delete
mcp.execute
```

### Adicionar Permission a Role

```bash
curl -X POST http://localhost:3000/admin/role/:roleId/tool-permission \
  -H "Content-Type: application/json" \
  -d '{"toolId": "github.create-issue"}'
```
