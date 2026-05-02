# Setup de Desenvolvimento

## Pré-requisitos

- Node.js 20+
- npm ou pnpm
- Git

## Clone do Repositório

```bash
cd /app/workspaces/8ab0d910-cfde-491e-997e-a28db003319e/workspace
git clone https://github.com/alternative-down/ad-product-forge.git repo
cd repo
```

## Instalar Dependências

```bash
npm install
# ou
pnpm install
```

## Configurar Ambiente

```bash
# Criar arquivo .env
cp .env.example .env

# Gerar ENCRYPTION_KEY
openssl rand -base64 32
# Copiar a chave gerada para ENCRYPTION_KEY no .env

# Criar diretórios
mkdir -p data workspaces
```

## Variáveis Obrigatórias

```env
ENCRYPTION_KEY=sua_chave_aqui
DATABASE_URL=file:./data/forge.db
FORGE_DATA_PATH=./data
WORKSPACE_BASE_PATH=./workspaces
```

## Comandos Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Iniciar em modo desenvolvimento |
| `npm run build` | Buildar para produção |
| `npm start` | Iniciar em produção |
| `npm test` | Rodar todos os testes |
| `npm run test:coverage` | Rodar com coverage |
| `npm run db:generate` | Gerar migrations |
| `npm run db:migrate` | Aplicar migrations |
| `npm run db:studio` | Abrir Drizzle Studio |

## Verificar Instalação

```bash
npm run dev &
sleep 5
curl http://localhost:3000/admin/system/health
```

Deve retornar:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "components": {
    "database": "connected"
  }
}
```

## IDE Setup

### VS Code

Extensões recomendadas:
- ESLint
- Prettier
- TypeScript Vue Plugin
- Drizzle

## Troubleshooting

### Erro de Port

```bash
# Verificar porta em uso
lsof -i :3000

# Ou usar outra porta
export HTTP_PORT=3001
```

### Erro de Permissão

```bash
# Linux
sudo chown -R $USER:$USER .
```
