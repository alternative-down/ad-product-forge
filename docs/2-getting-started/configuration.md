# Configuração Inicial

Após a instalação básica, configure o sistema para o seu ambiente.

## Variáveis de Ambiente

### Obrigatórias

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `ENCRYPTION_KEY` | Chave AES-256 (32 bytes, base64) | `openssl rand -base64 32` |
| `DATABASE_URL` | URL do banco libsql | `file:./data/forge.db` |
| `FORGE_DATA_PATH` | Diretório de dados | `./data` |
| `WORKSPACE_BASE_PATH` | Diretório dos workspaces | `./workspaces` |

### Opcionais

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `HTTP_PORT` | `3000` | Porta do servidor |
| `HTTP_HOST` | `0.0.0.0` | Host do servidor |
| `LOG_LEVEL` | `info` | Nível de log |

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

### Integrações

```bash
# Coolify
COOLIFY_API_KEY=xxx
COOLIFY_BASE_URL=https://coolify.example.com

# Migadu (Email)
MIGADU_API_KEY=xxx
MIGADU_API_BASE_URL=https://api.migadu.com
MIGADU_DOMAIN=example.com

# GitHub (App)
GITHUB_APP_ID=xxx
GITHUB_APP_PRIVATE_KEY=xxx
GITHUB_APP_INSTALLATION_ID=xxx
```

## Configuração do Banco de Dados

### SQLite Local

```env
DATABASE_URL=file:./data/forge.db
```

### Turso (SQLite em nuvem)

```env
DATABASE_URL=libsql://your-db.turso.io
DATABASE_AUTH_TOKEN=your-auth-token
```

## Criptografia de Credenciais

Todas as credenciais são criptografadas com AES-256-GCM.

```typescript
import { encryptSecret, decryptSecret } from './encryption/crypto';

// Criptografar antes de salvar
const encrypted = encryptSecret(JSON.stringify(credentials));

// Descriptografar para usar
const credentials = JSON.parse(decryptSecret(encrypted));
```

### ENCRYPTION_KEY

**IMPORTANTE**: Esta chave não pode ser perdida.

```bash
# Gerar chave
openssl rand -base64 32

# Verificar tamanho (deve ser 44 caracteres base64 = 32 bytes)
echo $ENCRYPTION_KEY | wc -c
# deve mostrar 45 (44 + newline)
```

## Perfis LLM

Configure modelos de linguagem.

```typescript
interface LlmProfile {
  id: string;
  name: string;                  // "primary", "om", etc
  provider: 'openai' | 'minimax' | 'anthropic';
  model: string;               // "gpt-4", "claude-3"
  temperature: number;          // 0-2
  maxTokens: number;            // máximo na resposta
}
```

### Perfis Padrão

| Nome | Uso | Descrição |
|------|-----|-----------|
| `primary` | Execução normal | Para operações gerais |
| `om` | Operational Memory | Para tarefas de memória |

## Roles e Permissões

### Criar um Role

```bash
curl -X POST http://localhost:3000/admin/role \
  -H "Content-Type: application/json" \
  -d '{
    "name": "developer",
    "description": "Desenvolvedor com acesso GitHub",
    "agentToolPermissions": [
      "github.create-issue",
      "github.create-pull-request",
      "github.commit-file"
    ],
    "agentWorkflowPermissions": []
  }'
```

### Tool Permissions Disponíveis

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

## System Settings

Configurações globais via API:

```bash
# Listar settings
curl http://localhost:3000/admin/system/settings

# Atualizar setting
curl -X PUT http://localhost:3000/admin/system/settings \
  -H "Content-Type: application/json" \
  -d '{"key": "llm.default_model", "value": "gpt-4"}'
```

### Settings Comuns

| Key | Tipo | Descrição |
|-----|------|-----------|
| `llm.default_model` | string | Modelo LLM default |
| `llm.observation_previous_observer_tokens` | number | Tokens para observação |
| `checkpointing.om_recent_raw_tokens` | number | Tokens recentes no checkpoint |

## Validação

O sistema valida todas as entradas com Zod schemas.

```typescript
const schema = z.object({
  name: z.string().min(1).max(100),
  roleId: z.string().uuid(),
  workspacePath: z.string().min(1),
});
```
