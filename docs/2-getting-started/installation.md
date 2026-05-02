# Instalação

Este guia passo a passo explica como instalar e configurar o ad-product-forge.

## Passo 1: Clonar o Repositório

```bash
git clone https://github.com/alternative-down/ad-product-forge.git
cd ad-product-forge
```

## Passo 2: Instalar Dependências

```bash
# Usando npm
npm install

# Ou usando pnpm (recomendado)
pnpm install
```

Aguarde até que todas as dependências sejam instaladas. Isso pode levar alguns minutos.

## Passo 3: Gerar Chave de Criptografia

O sistema requer uma chave de criptografia para proteger credenciais.

```bash
# Gere uma chave de 32 bytes
openssl rand -base64 32

# Exemplo de saída:
# YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=
```

**Importante**: Guarde esta chave em um local seguro. Se você perder a chave, não será possível descriptografar as credenciais armazenadas.

## Passo 4: Configurar Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto:

```bash
touch .env
```

Adicione as seguintes variáveis:

```env
# Obrigatório
ENCRYPTION_KEY=sua_chave_aqui

# Database
DATABASE_URL=file:./data/forge.db

# Caminhos
FORGE_DATA_PATH=./data
WORKSPACE_BASE_PATH=./workspaces

# Opcional (padrões mostrados)
HTTP_PORT=3000
HTTP_HOST=0.0.0.0
LOG_LEVEL=info
```

### Exemplo Completo

```env
# Chave de criptografia (gerada no passo 3)
ENCRYPTION_KEY=YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=

# URL do banco de dados (SQLite local)
DATABASE_URL=file:./data/forge.db

# Diretórios de dados
FORGE_DATA_PATH=./data
WORKSPACE_BASE_PATH=./workspaces

# Configuração do servidor
HTTP_PORT=3000
HTTP_HOST=0.0.0.0

# Nível de log (debug, info, warn, error)
LOG_LEVEL=info

# OpenAI (opcional)
# OPENAI_API_KEY=sk-your-key-here

# MiniMax (opcional)
# MINIMAX_API_KEY=your-key
# MINIMAX_GROUP_ID=your-group-id

# Coolify (opcional)
# COOLIFY_API_KEY=your-api-key
# COOLIFY_BASE_URL=https://your-coolify-instance.com

# Migadu Email (opcional)
# MIGADU_API_KEY=your-api-key
# MIGADU_API_BASE_URL=https://api.migadu.com
# MIGADU_DOMAIN=your-domain.com
```

## Passo 5: Criar Diretórios de Dados

```bash
mkdir -p data workspaces
```

O diretório `data/` armazenará o banco SQLite.
O diretório `workspaces/` armazenará os workspaces dos agentes.

## Passo 6: Verificar Instalação

Execute o health check para verificar se tudo está configurado:

```bash
npm run dev &
sleep 5
curl http://localhost:3000/admin/system/health
```

Você deve ver uma resposta JSON:

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00Z",
  "components": {
    "database": "connected"
  }
}
```

## Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia o servidor em modo desenvolvimento |
| `npm run build` | Compila o projeto para produção |
| `npm start` | Inicia o servidor em modo produção |
| `npm test` | Executa todos os testes |
| `npm run test:coverage` | Executa testes com coverage |
| `npm run db:generate` | Gera migrations do banco |
| `npm run db:migrate` | Aplica migrations pendentes |
| `npm run db:studio` | Abre Drizzle Studio (interface visual do banco) |

## Estrutura de Diretórios Após Instalação

```
ad-product-forge/
├── .env                    # Suas configurações
├── data/                   # Banco SQLite
│   └── forge.db           # Arquivo do banco
├── workspaces/            # Workspaces dos agentes
├── node_modules/          # Dependências
├── apps/
│   ├── forge/             # Aplicação principal
│   └── forge-admin/       # Interface admin
├── packages/               # Pacotes compartilhados
└── docs/                  # Esta documentação
```

## Troubleshooting

### Erro: ENCRYPTION_KEY not set

```bash
# Verifique se a variável está configurada
echo $ENCRYPTION_KEY

# Se vazio, configure
export ENCRYPTION_KEY=sua_chave_aqui
```

### Erro: Database locked

```bash
# Verifique se não há outro processo usando o banco
lsof data/forge.db

# Ou delete o arquivo e recrie
rm data/forge.db
```

### Erro: Port already in use

```bash
# Encontre e mate o processo usando a porta
lsof -i :3000
kill -9 <PID>

# Ou use outra porta
export HTTP_PORT=3001
```

## Próximos Passos

- [Configuração Inicial](./configuration.md) - Configurações avançadas
- [Criando seu Primeiro Agente](./first-agent.md) - Como criar um agente
- [Design do Sistema](../3-architecture/system-design.md) - Entenda a arquitetura
