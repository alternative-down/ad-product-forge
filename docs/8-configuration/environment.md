# Variáveis de Ambiente

## Obrigatórias

### ENCRYPTION_KEY

Chave de criptografia AES-256. Obrigatória para operar o sistema.

```bash
# Gerar chave
openssl rand -base64 32

# Exemplo de saída:
# YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=

# Configurar
export ENCRYPTION_KEY=YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=
```

**IMPORTANTE**: 
- Não perdem esta chave
- Sem ela, credenciais no banco não podem ser descriptografadas
- Guarde em local seguro (password manager, secrets manager)

### DATABASE_URL

URL do banco de dados libsql.

```bash
# SQLite local
export DATABASE_URL=file:./data/forge.db

# Turso (SQLite em nuvem)
export DATABASE_URL=libsql://your-db.turso.io
export DATABASE_AUTH_TOKEN=your-auth-token
```

### FORGE_DATA_PATH

Diretório para dados do sistema.

```bash
export FORGE_DATA_PATH=./data
```

### WORKSPACE_BASE_PATH

Diretório base para workspaces dos agentes.

```bash
export WORKSPACE_BASE_PATH=./workspaces
```

## Opcionais

### HTTP_PORT

Porta do servidor HTTP. Default: `3000`.

```bash
export HTTP_PORT=3000
```

### HTTP_HOST

Host do servidor HTTP. Default: `0.0.0.0`.

```bash
export HTTP_HOST=0.0.0.0
```

### LOG_LEVEL

Nível de logging. Default: `info`.

```bash
export LOG_LEVEL=debug   # Muito verboso
export LOG_LEVEL=info    # Normal
export LOG_LEVEL=warn    # Só warnings e errors
export LOG_LEVEL=error   # Só errors
```

## LLM Providers

### OpenAI

```bash
export OPENAI_API_KEY=sk-your-key-here
```

### MiniMax

```bash
export MINIMAX_API_KEY=your-key
export MINIMAX_GROUP_ID=your-group-id
```

### Anthropic

```bash
export ANTHROPIC_API_KEY=sk-ant-your-key-here
```

## Integrações

### Coolify

```bash
export COOLIFY_API_KEY=your-api-key
export COOLIFY_BASE_URL=https://coolify.example.com
```

### Migadu (Email)

```bash
export MIGADU_API_KEY=your-api-key
export MIGADU_API_BASE_URL=https://api.migadu.com
export MIGADU_DOMAIN=your-domain.com
```

### GitHub (App)

```bash
export GITHUB_APP_ID=123456
export GITHUB_APP_PRIVATE_KEY=-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----
export GITHUB_APP_INSTALLATION_ID=12345678
```

## Arquivo .env

Crie um arquivo `.env` na raiz do projeto:

```env
# Obrigatórios
ENCRYPTION_KEY=sua_chave_aqui
DATABASE_URL=file:./data/forge.db
FORGE_DATA_PATH=./data
WORKSPACE_BASE_PATH=./workspaces

# Servidor
HTTP_PORT=3000
HTTP_HOST=0.0.0.0
LOG_LEVEL=info

# LLM (escolha um)
OPENAI_API_KEY=sk-...

# Integrações
COOLIFY_API_KEY=xxx
COOLIFY_BASE_URL=https://coolify.example.com
MIGADU_API_KEY=xxx
MIGADU_API_BASE_URL=https://api.migadu.com
MIGADU_DOMAIN=example.com
GITHUB_APP_ID=xxx
GITHUB_APP_PRIVATE_KEY=xxx
GITHUB_APP_INSTALLATION_ID=xxx
```

## Carregar .env

```bash
# Usando dotenv
npm install dotenv
```

```typescript
import 'dotenv/config';
```

Ou use `source .env` em shell.

## Verificação

```bash
# Verificar variáveis configuradas
node -e "console.log('ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY ? 'SET' : 'MISSING')"
node -e "console.log('DATABASE_URL:', process.env.DATABASE_URL)"
```
