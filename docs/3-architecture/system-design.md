# Design do Sistema

## Visão Geral da Arquitetura

O ad-product-forge é uma plataforma multi-agente onde cada agente é um processo isolado com seu próprio runtime, memória e ferramentas. O sistemaorchestra agentes através de um registry central e um scheduler.

## Diagrama de Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                         Presentation Layer                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  forge-     │  │  Discord    │  │   Email     │              │
│  │  admin UI   │  │  Channels   │  │  Migadu     │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
└─────────┼───────────────┼───────────────┼──────────────────────┘
          │               │               │
┌─────────┴───────────────┴───────────────┴──────────────────────┐
│                          Admin API Layer                        │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │              apps/forge/src/admin/routes.ts                  ││
│  │   GET/POST/PUT/DELETE /admin/agent, /admin/schedule, etc   ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────┬───────────────────────────────────┘
                              │
┌─────────────────────────────┴───────────────────────────────────┐
│                       Agent Runtime Layer                       │
│                                                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │  Agent 1    │  │  Agent 2    │  │  Agent N    │               │
│  │  Runtime    │  │  Runtime    │  │  Runtime    │               │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘               │
│         │               │               │                       │
│  ┌──────┴───────────────┴───────────────┴──────┐                │
│  │           Internal Agent Registry            │                │
│  │         Map<agentId, InternalAgentRuntime>   │                │
│  └─────────────────────┬───────────────────────┘                │
└─────────────────────────┼───────────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────────┐
│                      Scheduler Layer                             │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │        apps/forge/src/agents/agent-runner-scheduler.ts      ││
│  │   Timers, Cron expressions, Event-driven triggers          ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────┬───────────────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────────────┐
│                       Data Layer                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  agents     │  │  contracts  │  │   steps     │              │
│  │  roles      │  │  schedules  │  │   ledger    │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                        SQLite/Turso                              │
└─────────────────────────────────────────────────────────────────┘
```

## Componentes Principais

### 1. AgentRegistry

O **AgentRegistry** é o central hub que mantém todas as instâncias de runtime dos agentes ativos.

**Localização**: `apps/forge/src/agents/internal-agent-registry.ts`

**Interface**:
```typescript
interface InternalAgentRegistry {
  // Adicionar agente ao registry
  add(runtime: InternalAgentRuntime): void;
  
  // Remover agente
  remove(agentId: string): void;
  
  // Obter runtime de um agente
  get(agentId: string): InternalAgentRuntime | null;
  
  // Listar todos os agentes
  list(): InternalAgentRuntime[];
  
  // Verificar se existe
  has(agentId: string): boolean;
  
  // Iniciar execução de um agente
  run(agentId: string): void;
  
  // Parar execução de um agente
  stop(agentId: string): void;
}
```

### 2. AgentRunner

O **AgentRunner** orchestra a execução de um agente individual.

**Localização**: `apps/forge/src/agents/agent-runner.ts` (~1300 linhas)

**Responsabilidades**:
- Gerenciar loop de execução
- Detectar loops infinitos
- Controlar timeouts
- Atualizar estado de execução

```typescript
class AgentRunner {
  async beginRun(): Promise<void>;
  async nextStep(options?: StepOptions): Promise<void>;
  async endRun(): Promise<void>;
  
  // Health check
  async healthcheck(): Promise<boolean>;
}
```

### 3. AgentScheduler

O **AgentScheduler** triggers `nextStep` dos agentes baseado em schedules.

**Localização**: `apps/forge/src/agents/agent-runner-scheduler.ts` (~674 linhas)

**Tipos de Schedule**:
- `cron`: Expressões cron pattern
- `interval`: Intervalos em milliseconds
- `oneshot`: Execução única

```typescript
interface AgentScheduleManager {
  // Criar schedule
  schedule(agentId: string, schedule: Schedule): void;
  
  // Cancelar schedule
  unschedule(agentId: string): void;
  
  // Pausar/agendar
  pause(agentId: string): void;
  resume(agentId: string): void;
}
```

### 4. ProviderLoader

O **ProviderLoader** carrega providers de comunicação.

**Localização**: `apps/forge/src/communication/provider-loader.ts`

```typescript
async function loadCommunicationProviders(
  credentials: ProviderCredentials[]
): Promise<CommunicationProvider[]>
```

### 5. AdminRoutes

A **AdminRoutes** expõe a REST API para gestão do sistema.

**Localização**: `apps/forge/src/admin/routes.ts` (~1348 linhas)

**Rotas Principais**:
- `/admin/agent` - CRUD de agentes
- `/admin/schedule` - CRUD de schedules
- `/admin/role` - CRUD de roles
- `/admin/finance` - Operações financeiras

## Padrões Arquiteturais

### Dependency Injection

Stores são criados via factories com `db` injetado:

```typescript
// Bom - injeção via factory
const capabilities = createCapabilityStore(db);
const agentContracts = createAgentContractStore(db);

// Exceção - singleton global
const registry = getInternalAgentRegistry(); // Não é DI
```

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
  agentId: z.string().min(1).optional(),
  providerType: z.enum(['discord', 'internal-chat', 'email']),
  credentials: z.unknown(),
});
```

## Fluxo de Inicialização

```
main.ts
  │
  ├── getInternalAgentRegistry()
  │     └── Cria Map vazio para runtimes
  │
  ├── createAgentContractStore(db)
  │     └── Store para contratos financeiros
  │
  ├── createCapabilityStore(db)
  │     └── Store para roles e permissions
  │
  ├── loadAgentRuntimeData(db, config)
  │     ├── fetch agent from DB
  │     ├── decrypt provider credentials
  │     └── loadCommunicationProviders()
  │
  ├── registry.loadAll()
  │     └── Carrega todos os agentes do banco
  │
  ├── registry.runAll()
  │     └── Inicia execução de todos os agentes
  │
  ├── createAgentScheduleManager()
  │     └── Cria scheduler com timers
  │
  └── registerAdminRoutes()
        └── Expõe REST API
```

## Fluxo de Execução

```
1. Scheduler (timer)
      │
      ▼
2. AgentRunner.nextStep()
      │
      ├── Load context (LTM + providers)
      │
      ├── Execute generate() via LLM
      │
      ├── Interpret response
      │
      │    ├── Se tool call → verify permission → execute tool
      │    ├── Se message → prepare response
      │    └── Se done → end step
      │
      ├── Update LTM (checkpoint)
      │
      ├── Notify providers
      │
      └── Log step to DB
```

## Estado do Sistema

| Estado | Significado |
|--------|-------------|
| `idle` | Agente parado, aguardando próximo step |
| `running` | Agente executando generate() |
| `absent` | Agente não está no registry |

## Decisões de Design

### Por que Singleton Registry?

O registry é um singleton porque:
1. Todos os agentes precisam ser acessíveis globalmente
2. O scheduler precisa acessar todos os agentes
3. Providers precisam notificar agentes específicos

### Por que Drizzle ORM?

Drizzle foi escolhido porque:
1. Type-safe queries
2. Suporte a SQLite e Turso
3. Migrations integradas
4. Performance boa para SQLite

### Por que AES-GCM?

AES-GCM foi escolhido porque:
1. AEAD (Authenticated Encryption with Associated Data)
2. Performance boa
3. Suporte nativo em Node.js
4. Não requer bibliotecas externas
