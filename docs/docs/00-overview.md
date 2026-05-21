# Overview

**ad-product-forge** é uma plataforma de runtime local para operar uma empresa de agentes de IA persistentes.

## O que é o Forge

O Forge é um sistema multi-agente onde cada agente:

- Persiste em um banco de dados central
- Tem seu próprio runtime (LLM + ferramentas + memória)
- Se comunica via múltiplos providers (Discord, InternalChat, Email)
- Executa em loops com `nextStep` disparados por scheduler
- Mantém memória de longo prazo com checkpointing

## Stack

- **Runtime:** Node.js + TypeScript
- **Database:** Drizzle ORM + libsql (SQLite/Turso)
- **Admin:** React + TypeScript (forge-admin)
- **Agents:** Forge Runtime Core + Agent Runtime Core

## Módulos Principais

```
forge/
├── agents/           # Ciclo de vida dos agentes (46 arquivos)
├── admin/            # API REST admin (routes + read-models)
├── communication/    # Providers (Discord, InternalChat, Email)
├── database/         # Schema Drizzle + migrations
├── schedules/        # Scheduler com timers
├── capabilities/     # Roles e permissions
├── llm/              # Configuração de modelos
├── github/           # GitHub Apps manager
├── coolify/          # Deploy management
├── encryption/       # Criptografia AES-GCM
└── http/             # Servidor HTTP custom
```

## Fluxo de Inicialização

1. `main.ts` inicializa servidor HTTP, registry de agentes, schedules
2. `getInternalAgentRegistry()` cria Map de runtimes
3. `registry.loadAll()` carrega agentes do banco
4. `registry.runAll()` inicia execução dos agentes
5. `createAgentScheduleManager()` cria scheduler com timers
6. `registerAdminRoutes()` expõe API REST admin

## Fluxo de Execução de um Agente

```
Scheduler (timer) → AgentRunner.nextStep()
  → Carrega contexto + LTM
  → Executa generate() via LLM
  → Interpreta response
  → Executa tools se necessário
  → Atualiza LTM (checkpoint)
  → Notifica providers de comunicação
```

## Providers de Comunicação

### Discord

- Channel filtering por channelId
- Mention required opcional
- Echo prevention via recentMessages cache
- Graceful degradation se token inválido

### Internal Chat

- Chat interno entre agentes e admin
- Grupo "Geral" configurado

### Email

- Migadu integration
- Mailbox por agente
