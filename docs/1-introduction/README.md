# O que é o Forge

## Visão Geral

**ad-product-forge** é uma plataforma de runtime local-first projetada para operar uma empresa composta por agentes de IA persistentes. O sistema permite criar, gerenciar e orquestrar múltiplos agentes autônomos que executam tarefas, se comunicam entre si e com humanos, e mantêm memória de longo prazo.

Diferente de chatbots tradicionais que são criados e destruídos a cada sessão, os agentes no Forge:
- **Persistem** em um banco de dados central
- **Mantêm estado** entre sessões
- **Têm workspaces dedicados** no filesystem
- **Carregam configurações** e credenciais do banco
- **Executam de forma autônoma** conforme schedules definidos

## Arquitetura em Camadas

O sistema é organizado em camadas hierárquicas:

```
┌─────────────────────────────────────────┐
│           Presentation Layer            │
│  (forge-admin UI, Discord, Email, etc)  │
├─────────────────────────────────────────┤
│           Admin API                     │
│  (REST API for system management)       │
├─────────────────────────────────────────┤
│         Agent Runtime                   │
│  (LLM + Tools + Memory + Communication) │
├─────────────────────────────────────────┤
│         Agent Scheduler                 │
│  (Timers, Cron, Event-driven triggers) │
├─────────────────────────────────────────┤
│         Agent Registry                  │
│  (Central registry of active agents)   │
├─────────────────────────────────────────┤
│         Database                        │
│  (SQLite/Turso - Agents, Contracts,    │
│   Logs, Settings)                       │
└─────────────────────────────────────────┘
```

## Características Principais

### 1. Agentes Persistentes

Cada agente no Forge possui sua própria instância de runtime com:
- Identidade única (UUID)
- Nome descritivo
- Role com permissões
- LLM configurável
- Ferramentas específicas
- Providers de comunicação
- Memória operacional e de longo prazo

### 2. Sistema de Contratos e Budget

O Forge implementa contabilidade baseada em contratos:
- Cada agente tem um orçamento (budget) em USD
- Cada execução (step) é registrada e consome budget
- Contratos definem períodos de vigência
- Sistema de ledger para entradas/saídas financeiras
- Top-ups podem ser feitos para adicionar budget

### 3. Múltiplos Canais de Comunicação

Agentes podem se comunicar via:
- **Discord**: Mensagens em canais guild ou DMs
- **Internal Chat**: Chat interno entre agentes e admins
- **Email**: Integração com Migadu para email real

### 4. Sistema de Schedules Flexível

Agentes executam baseados em schedules:
- **Cron**: Expressões cron (ex: `0 * * * *` para a cada hora)
- **Interval**: Intervalos fixos em milliseconds
- **Oneshot**: Execuções únicas em momentos específicos

### 5. Memória de Longo Prazo

Sistema de memória em duas camadas:
- **Working Memory**: Memória operacional durante execução
- **Long-Term Memory**: Memória persistente com checkpointing

## Stack Tecnológica

| Componente | Tecnologia | Descrição |
|------------|------------|-----------|
| Runtime | Node.js + TypeScript | Plataforma de execução |
| Database | Drizzle ORM + libsql | ORM com suporte a SQLite e Turso |
| Admin UI | React + TypeScript | Interface administrativa |
| Agent Core | Forge Runtime Core + Agent Runtime Core | Bibliotecas core para agents |
| HTTP Server | Custom implementation | Servidor HTTP customizado |
| Encryption | AES-256-GCM | Criptografia para credenciais |

## Arquivos Principais do Sistema

| Arquivo/Diretório | Responsabilidade |
|-------------------|------------------|
| `apps/forge/src/main.ts` | Entry point, inicialização do sistema |
| `apps/forge/src/agents/internal-agent-registry.ts` | Registry central de agentes |
| `apps/forge/src/agents/agent-runner.ts` | Loop de execução do agente |
| `apps/forge/src/agents/agent-runner-scheduler.ts` | Scheduler de execução |
| `apps/forge/src/admin/routes.ts` | API REST admin |
| `apps/forge/src/github/manager.ts` | Gerenciamento GitHub Apps |
| `apps/forge/src/communication/provider-loader.ts` | Carregamento de providers |
| `apps/forge/src/database/schema.ts` | Schema do banco de dados |

## Fluxo Básico de Execução

### 1. Inicialização do Sistema

```typescript
// main.ts
main()
  ├── Carrega configurações de ambiente
  ├── Cria registry de agentes (getInternalAgentRegistry)
  ├── Cria stores (AgentContractStore, CapabilityStore)
  ├── Inicializa sistema de email (AgentEmailManager)
  ├── Cria scheduler (createAgentScheduleManager)
  ├── Registra rotas admin (registerAdminRoutes)
  └── Inicia servidor HTTP
```

### 2. Execução de um Agente

```
Scheduler (timer)
  → AgentRunner.nextStep()
     → Carrega contexto (memória + providers)
     → LLM gera resposta (generate)
     → Ferramentas são executadas se necessário
     → Estado é checkpointado (LTM)
     → Providers são notificados
     → Step é logado no banco
```

### 3. Comunicação

```
Mensagem Recebida
  → Provider filtra e processa
  → AgentRunner.processInbound()
  → Agente processa e gera resposta
  → Response enviada pelo provider
```

## Quando Usar o Forge

### Cenários Ideais
- Automação de processos internos da empresa
- Agentes que precisam manter contexto de longo prazo
- Operações que requerem múltiplas integrações (GitHub, Discord, etc)
- Escalabilidade horizontal com múltiplos agentes especializados

### Quando Não Usar
- Processos simples de única execução
- Tasks que não requerem persistência
- Chatbots simples sem necessidade de memória

## Próximos Passos

- Leia [Conceitos Fundamentais](./concepts.md) para entender os termos do sistema
- Veja [Instalação](../2-getting-started/installation.md) para começar a usar
- Explore [Design do Sistema](../3-architecture/system-design.md) para entender a arquitetura
