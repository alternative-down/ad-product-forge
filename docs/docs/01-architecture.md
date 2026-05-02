# Arquitetura

## Visão Geral

O Forge é uma plataforma multi-agente construída sobre Node.js + TypeScript. Cada agente é um processo isolado com seu próprio runtime, memória e ferramentas.

## Stack

| Componente | Tecnologia |
|------------|------------|
| Runtime | Node.js + TypeScript |
| Database | Drizzle ORM + libsql (SQLite/Turso) |
| Admin UI | React + TypeScript |
| Agent Core | Forge Runtime Core + Agent Runtime Core |

## Estrutura de Diretórios

```
ad-product-forge/
├── apps/
│   ├── forge/              # Main application
│   │   └── src/
│   │       ├── agents/     # Agent lifecycle (46 arquivos)
│   │       ├── admin/      # REST API + read-models
│   │       ├── communication/  # Providers (Discord, InternalChat, Email)
│   │       ├── database/   # Schema Drizzle + migrations
│   │       ├── schedules/  # Scheduler com timers
│   │       ├── capabilities/   # Roles e permissions
│   │       ├── llm/        # Configuração de modelos
│   │       ├── github/     # GitHub Apps manager
│   │       ├── coolify/    # Deploy management
│   │       ├── encryption/ # Criptografia AES-GCM
│   │       └── http/       # Servidor HTTP custom
│   └── forge-admin/        # Admin dashboard UI
├── packages/
│   ├── agent-runtime-core/ # Core runtime para agents
│   └── forge-runtime-core/ # Core runtime para Forge
└── docs/                   # Documentação
```

## Módulos Principais

### Agents (`apps/forge/src/agents/`)

Responsável por todo lifecycle do agente.

**Sub-sistemas:**
- **Runner** (`agent-runner.ts`, `agent-runner-scheduler.ts`) — orquestra execução, timers, healthcheck
- **Runtime** (`agent-runtime-*.ts`) — executa prompts via LLM
- **Loader** (`agent-loader*.ts`) — carrega dados do banco
- **LTM** (`agent-long-term-memory*.ts`) — memória de longo prazo, recall, checkpointing
- **Hiring/Termination** — admission e saída de agentes
- **Contracts** — gestão financeira de contratos
- **Skills** — workspace skills + global skills
- **Registry** — singleton Map<agentId, InternalAgentRuntime>

### Admin API (`apps/forge/src/admin/`)

API REST para gestão do sistema.

- `routes.ts` — 26 rotas (CRUD agentes, providers, MCP, schedules, roles, skills, finance)
- `read-model/` — modelos de leitura para dashboard
- `routes/` — sub-módulos extraídos (agents, finance, system, internal-chat)

### Communication (`apps/forge/src/communication/`)

Providers de comunicação entre agentes e mundo externo.

- **Discord** — channel filtering, mentions, echo prevention, typing indicators
- **Internal Chat** — chat interno entre agentes e admin
- **Email** — Migadu integration

### Database (`apps/forge/src/database/`)

Schema Drizzle definindo todas as tabelas do sistema.

**Tabelas principais:**
- `agents` — agentes persistidos
- `agent_roles` — roles e capabilities
- `agent_providers` — credenciais de providers
- `agent_execution_contracts` — contratos financeiros
- `agent_execution_steps` — logs de execução
- `schedules` — agendamentos
- `system_settings` — configurações globais

### Integrations

- **github/** — GitHub Apps manager (1477 linhas)
- **coolify/** — Deploy management (742 linhas)
- **system-integrations/** — Migadu, Coolify, GitHub, MiniMax configs

## Padrões Arquiteturais

### Dependency Injection

Stores criados via factories com `db` injetado:

```typescript
const capabilities = createCapabilityStore(db);
const agentContracts = createAgentContractStore(db);
```

**Exceção:** `getInternalAgentRegistry()` é singleton global — inconsistente com o padrão DI.

### Logging

Padrão: `forgeDebug({ scope, level, message, context })`

```typescript
forgeDebug({ 
  scope: 'agent-runner', 
  level: 'error', 
  message: 'healthcheck failed', 
  context: { error } 
});
```

### Validação

Zod schemas para toda entrada de API:

```typescript
const upsertAgentSchema = z.object({
  agentId: z.string().min(1),
  providerType: z.enum(['discord', 'internal-chat', 'email']),
  credentials: z.unknown(),
});
```

### Criptografia

AES-GCM para credenciais sensíveis:

```typescript
const encrypted = encryptSecret(JSON.stringify(credentials));
const decrypted = JSON.parse(decryptSecret(encrypted));
```

## Fluxo de Inicialização

```
main.ts
  ├── getInternalAgentRegistry()
  ├── createAgentContractStore(db)
  ├── createCapabilityStore(db)
  ├── loadAgentRuntimeData(db, config)
  │   ├── fetch agent from DB
  │   ├── decrypt provider credentials
  │   └── loadCommunicationProviders(providerCredentials)
  ├── registry.loadAll()
  ├── registry.runAll()
  ├── createAgentScheduleManager()
  └── registerAdminRoutes()
```

## Fluxo de Execução de um Agente

```
Scheduler (timer)
  → AgentRunner.nextStep()
     → Carrega contexto + LTM
     → Executa generate() via LLM
     → Interpreta response
     → Executa tools se necessário
     → Atualiza LTM (checkpoint)
     → Notifica providers de comunicação
```

## Estado do Sistema

| Estado | Significado |
|--------|-------------|
| `idle` | Agente parado, aguardando próximo step |
| `running` | Agente executando generate() |
| `absent` | Agente não está no registry |
