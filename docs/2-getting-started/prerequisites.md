# Pré-requisitos

Antes de começar a usar o ad-product-forge, certifique-se de que seu ambiente atende aos seguintes requisitos.

## Requisitos de Sistema

### Hardware

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| CPU | 2 cores | 4+ cores |
| RAM | 4 GB | 8+ GB |
| Disco | 10 GB livre | 50+ GB SSD |

### Software

#### Node.js

**Versão mínima: 20.x**

Verifique sua versão:
```bash
node --version
# deve mostrar v20.x.x ou superior
```

Instalar Node.js:
- [Download oficial](https://nodejs.org/)
- Ou usar [nvm](https://github.com/nvm-sh/nvm) para gerenciar versões

#### npm ou pnpm

O sistema aceita ambos. Recomendamos pnpm para melhor performance.

```bash
# Verificar npm
npm --version

# Verificar pnpm (opcional)
pnpm --version

# Instalar pnpm se necessário
npm install -g pnpm
```

#### Git

```bash
git --version
# deve mostrar 2.x.x ou superior
```

#### SQLite

O sistema usa SQLite por padrão. Não é necessário instalar separadamente — o driver `libsql` é instalado via npm.

Para usar Turso (SQLite em nuvem), você precisará:
- Conta no [Turso](https://turso.tech/)
- CLI do Turso instalado: `brew install/turso-cli/tap/turso`

## Variáveis de Ambiente Obrigatórias

Antes de iniciar, você precisará gerar uma chave de criptografia.

### Gerar ENCRYPTION_KEY

```bash
# Linux/Mac
openssl rand -base64 32

# Exemplo de saída:
# YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=
```

Guarde esta chave com segurança. Ela é usada para criptografar credenciais no banco de dados.

## Portas Necessárias

| Porta | Serviço | Descrição |
|-------|---------|-----------|
| 3000 | HTTP Server | Servidor principal do Forge |
| 143 | IMAP (opcional) | Para receber emails |
| 465 | SMTP (opcional) | Para enviar emails |

## Credenciais Necessárias

Dependendo das integrações que você usar:

### Discord (opcional)
- Bot Token (obtido no Discord Developer Portal)

### GitHub (opcional)
- GitHub App credentials (App ID, Private Key, Installation ID)

### Coolify (opcional)
- API Key do Coolify
- URL base do Coolify

### Migadu (opcional)
- API Key do Migadu
- Domínio configurado

## Ferramentas de Desenvolvimento

### Editor de Código

Recomendamos VS Code com as seguintes extensões:
- TypeScript Vue Plugin (Volar)
- ESLint
- Prettier

### Terminal

Recomendamos usar um terminal moderno com suporte a:
- Cores (ANSI)
- Tabs/ split panes
- Search history

## Verificação do Ambiente

Execute este script para verificar se tudo está configurado:

```bash
#!/bin/bash
echo "=== Verificação do Ambiente ==="

echo -n "Node.js: "
node --version

echo -n "npm: "
npm --version

echo -n "Git: "
git --version

echo ""
echo "=== Variáveis de Ambiente ==="
echo -n "ENCRYPTION_KEY: "
if [ -z "$ENCRYPTION_KEY" ]; then
  echo "NÃO CONFIGURADA (obrigatório)"
else
  echo "CONFIGURADA"
fi

echo -n "DATABASE_URL: "
if [ -z "$DATABASE_URL" ]; then
  echo "NÃO CONFIGURADA (obrigatório)"
else
  echo "$DATABASE_URL"
fi

echo ""
echo "=== Próximos Passos ==="
echo "1. Configure as variáveis de ambiente"
echo "2. Execute 'npm install'"
echo "3. Execute 'npm run dev'"
```

## Problemas Comuns

### Node.js versão errada

Se você ver erros como "ExperimentalWarning" ou problemas de módulos:
```bash
# Use nvm para instalar a versão correta
nvm install 20
nvm use 20
```

### Permissão negada ao instalar

```bash
# Linux/Mac
sudo npm install -g pnpm

# Ou configure npm para não precisar de sudo
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
source ~/.bashrc
```

### Porta já em uso

Se a porta 3000 estiver em uso:
```bash
# Encontre o processo usando a porta
lsof -i :3000

# Ou mude a porta no .env
export HTTP_PORT=3001
```
