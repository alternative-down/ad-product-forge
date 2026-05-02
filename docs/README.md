# ad-product-forge — Documentação do Sistema

Documentação completa do sistema ad-product-forge, uma plataforma de runtime local para operar uma empresa de agentes de IA persistentes.

## Estrutura da Documentação

### 1. Introdução
- [O que é o Forge](./1-introduction/README.md)
- [Conceitos Fundamentais](./1-introduction/concepts.md)
- [Visão Geral Rápida](./1-introduction/quick-overview.md)

### 2. Primeiros Passos
- [Pré-requisitos](./2-getting-started/prerequisites.md)
- [Instalação](./2-getting-started/installation.md)
- [Configuração Inicial](./2-getting-started/configuration.md)
- [Criando seu Primeiro Agente](./2-getting-started/first-agent.md)

### 3. Arquitetura
- [Design do Sistema](./3-architecture/system-design.md)
- [Visão Geral dos Módulos](./3-architecture/module-overview.md)
- [Fluxo de Dados](./3-architecture/data-flow.md)
- [Estrutura de Arquivos](./3-architecture/file-structure.md)
- [Padrões Arquiteturais](./3-architecture/patterns.md)

### 4. Agentes
- [Ciclo de Vida do Agente](./4-agents/lifecycle.md)
- [Runtime do Agente](./4-agents/runtime.md)
- [Scheduler do Agente](./4-agents/scheduler.md)
- [Sistema de Memória](./4-agents/memory.md)
- [Skills](./4-agents/skills.md)
- [Capabilities e Permissões](./4-agents/capabilities.md)

### 5. Comunicação
- [Visão Geral da Comunicação](./5-communication/overview.md)
- [Provider Discord](./5-communication/discord.md)
- [Provider Internal Chat](./5-communication/internal-chat.md)
- [Provider Email](./5-communication/email.md)
- [Formato de Mensagens](./5-communication/messages.md)

### 6. API Admin
- [Visão Geral da API](./6-admin-api/README.md)
- [Rotas de Agentes](./6-admin-api/agents.md)
- [Rotas de Schedules](./6-admin-api/schedules.md)
- [Rotas de Roles](./6-admin-api/roles.md)
- [Rotas de Finance](./6-admin-api/finance.md)
- [Rotas de Sistema](./6-admin-api/system.md)

### 7. Integrações
- [Integração GitHub](./7-integrations/github.md)
- [Integração Coolify](./7-integrations/coolify.md)
- [Integração Email (Migadu)](./7-integrations/email.md)
- [Integração MiniMax](./7-integrations/minimax.md)
- [Integrações de Sistema](./7-integrations/system.md)

### 8. Configuração
- [Variáveis de Ambiente](./8-configuration/environment.md)
- [Perfis LLM](./8-configuration/llm-profiles.md)
- [Roles e Permissões](./8-configuration/roles.md)
- [Configuração de Agentes](./8-configuration/agents.md)

### 9. Ferramentas
- [Visão Geral das Ferramentas](./9-tools/README.md)
- [Ferramentas GitHub](./9-tools/github.md)
- [Ferramentas Coolify](./9-tools/coolify.md)
- [Ferramentas Discord](./9-tools/discord.md)
- [Ferramentas Email](./9-tools/email.md)
- [Ferramentas de Schedule](./9-tools/schedule.md)
- [Ferramentas MCP](./9-tools/mcp.md)

### 10. Desenvolvimento
- [Setup de Desenvolvimento](./10-development/setup.md)
- [Padrões de Código](./10-development/code-patterns.md)
- [Testes](./10-development/testing.md)
- [Banco de Dados](./10-development/database.md)
- [Como Contribuir](./10-development/contributing.md)

### 11. Monitoramento
- [Health Checks](./11-monitoring/health.md)
- [Métricas](./11-monitoring/metrics.md)
- [Logging](./11-monitoring/logging.md)

### 12. Troubleshooting
- [Problemas Comuns](./12-troubleshooting/common.md)
- [Procedimentos de Recuperação](./12-troubleshooting/recovery.md)
- [Debugging](./12-troubleshooting/debugging.md)

### 13. Segurança
- [Melhores Práticas de Segurança](./13-security/best-practices.md)
- [Credenciais](./13-security/credentials.md)
- [Permissões](./13-security/permissions.md)

### 14. Referências
- [Schema do Banco de Dados](./14-references/database-schema.md)
- [Referência da API](./14-references/api-reference.md)
- [Glossário](./14-references/glossary.md)

## Instalação Rápida

```bash
# Clone o repositório
git clone https://github.com/alternative-down/ad-product-forge.git
cd ad-product-forge

# Instale as dependências
npm install

# Gere a chave de criptografia (obrigatório)
openssl rand -base64 32

# Configure as variáveis de ambiente
export ENCRYPTION_KEY=<sua-chave-aqui>
export DATABASE_URL=file:./data/forge.db
export FORGE_DATA_PATH=./data
export WORKSPACE_BASE_PATH=./workspaces

# Inicie o servidor de desenvolvimento
npm run dev

# Para rodar os testes
npm test
```

## Requisitos do Sistema

- Node.js versão 20 ou superior
- npm ou pnpm
- SQLite (ou Turso para produção)
- Variável de ambiente ENCRYPTION_KEY configurada

## Para Novos Membros

Se você é novo na empresa, comece por:
1. [O que é o Forge](./1-introduction/README.md)
2. [Conceitos Fundamentais](./1-introduction/concepts.md)
3. [Instalação](./2-getting-started/installation.md)
4. [Design do Sistema](./3-architecture/system-design.md)
