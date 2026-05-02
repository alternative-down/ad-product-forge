# Configuration

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `ENCRYPTION_KEY` | AES-256 encryption key (base64, 32 bytes) | `openssl rand -base64 32` |
| `DATABASE_URL` | libsql database URL | `file:./data/forge.db` or `libsql://xxx.turso.io` |
| `FORGE_DATA_PATH` | Data directory | `./data` (default) |
| `WORKSPACE_BASE_PATH` | Agent workspaces directory | `./workspaces` (default) |

### Optional

| Variable | Description | Default |
|----------|-------------|---------|
| `HTTP_PORT` | HTTP server port | `3000` |
| `HTTP_HOST` | HTTP server host | `0.0.0.0` |
| `LOG_LEVEL` | Log level (debug, info, warn, error) | `info` |

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

## Credentials Management

### Encryption

All credentials encrypted with AES-GCM:

```typescript
import { encryptSecret, decryptSecret } from './encryption/crypto';

const encrypted = encryptSecret(JSON.stringify(credentials));
const decrypted = JSON.parse(decryptSecret(encrypted));
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
  imap: { host, port, user, password },
  smtp: { host, port, user, password }
}

// Internal Chat
{ agentId: "agent-uuid" }
```

## LLM Profiles

Model configuration profiles:

```typescript
interface LlmProfile {
  id: string;
  name: string;
  provider: 'openai' | 'minimax' | 'anthropic';
  model: string;
  temperature: number;
  maxTokens: number;
}
```

Special profiles:
- `primary` — normal execution
- `om` — Operational Memory

## Roles and Permissions

### Create Role

```bash
curl -X POST http://localhost:3000/admin/role \
  -H "Content-Type: application/json" \
  -d '{
    "name": "developer",
    "description": "Developer with GitHub access",
    "agentToolPermissions": [
      "github.create-issue",
      "github.create-pull-request",
      "github.commit-file"
    ],
    "agentWorkflowPermissions": []
  }'
```

### Tool Permissions

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
