# Visão Geral dos Módulos

## Estrutura de Diretórios

```
apps/forge/src/
├── main.ts                          # Entry point
├── agents/                          # Ciclo de vida dos agentes
│   ├── internal-agent-registry.ts   # Registry central
│   ├── agent-runner.ts             # Loop de execução
│   ├── agent-runner-scheduler.ts   # Scheduler
│   ├── agent-runtime-platform.ts   # Runtime concreto
│   ├── agent-long-term-memory*.ts  # LTM
│   ├── hire-agent.ts               # Workflow de hiring
│   ├── terminate-agent.ts         # Workflow de termination
│   └── *.ts                        # ~40 arquivos de suporte
├── admin/                           # API REST
│   ├── routes.ts                   # ~1348 linhas, 26 rotas
│   ├── read-model/                 # Read models
│   └── routes/                     # Rotas extraídas
├── communication/                   # Providers
│   ├── provider-loader.ts          # Loader de providers
│   ├── discord-account.ts          # Provider Discord
│   ├── internal-chat-service.ts    # Internal chat
│   └── email/                      # Email integration
├── database/                        # Schema
│   ├── schema.ts                   # Schema Drizzle (~800 linhas)
│   └── migrations/                 # Migrations
├── schedules/                       # Scheduler
│   └── manager.ts                  # ~674 linhas
├── capabilities/                    # Roles e permissions
│   └── store.ts                    # Store de capabilities
├── llm/                             # Configuração de LLMs
│   └── profiles.ts                 # LLM profiles
├── github/                          # GitHub Apps
│   └── manager.ts                  # ~1477 linhas
├── coolify/                         # Deploy management
│   └── manager.ts                  # ~742 linhas
├── encryption/                      # Criptografia
│   └── crypto.ts                   # AES-GCM
├── email/                          # Migadu
│   └── migadu-manager.ts           # Email manager
└── http/                           # HTTP server
    └── server.ts                   # Servidor custom
```

## Módulos Principais

### Agents Module

**Responsabilidade**: Todo ciclo de vida do agente

**Arquivos principais**:
- `internal-agent-registry.ts` — Mapa de runtimes ativos
- `agent-runner.ts` — Loop de execução
- `agent-runner-scheduler.ts` — Scheduler
- `agent-runtime-platform.ts` — Runtime concreto

**Sub-sistemas**:
- Hiring/Termination — Admission e saída de agentes
- LTM — Memória de longo prazo com checkpointing
- Skills — Workspace skills + global skills
- Contracts — Gestão financeira

### Admin Module

**Responsabilidade**: REST API para gestão do sistema

**Arquivos principais**:
- `routes.ts` — 26 rotas principais

**Rotas**:
- Agentes (CRUD, wake, reload)
- Providers (upsert, delete)
- Schedules (CRUD, toggle)
- Roles (CRUD, permissions)
- Skills (upload)
- Finance (overview, ledger, payables)
- System (health, settings)

### Communication Module

**Responsabilidade**: Providers de comunicação

**Providers**:
- Discord — Channel filtering, mentions, echo prevention
- Internal Chat — Chat interno
- Email — Migadu integration

**Arquivos principais**:
- `provider-loader.ts` — Loader de providers
- `discord-account.ts` — Provider Discord
- `internal-chat-service.ts` — Internal chat

### Database Module

**Responsabilidade**: Schema e migrations

**Tabelas principais**:
- `agents` — Agentes persistidos
- `agent_roles` — Roles
- `agent_providers` — Credenciais
- `agent_execution_contracts` — Contratos
- `agent_execution_steps` — Logs
- `schedules` — Agendamentos
- `system_settings` — Configurações

### Integrations Module

**Responsabilidade**: Integrações externas

**GitHub** (`github/manager.ts` ~1477 linhas):
- Issues, PRs, Commits
- Labels, Milestones
- Repositories

**Coolify** (`coolify/manager.ts` ~742 linhas):
- Listar aplicações
- Deployar
- Gerenciar env vars

**Email** (`email/migadu-manager.ts`):
- Provisionar mailboxes
- Enviar/receber emails

## Interações Entre Módulos

```
main.ts
  ├── AgentRegistry ← agents/
  │     └── AgentRunner ← agents/
  │           └── AgentScheduler ← schedules/
  │
  ├── AdminRoutes ← admin/
  │     └── Stores (capabilities, contracts) ← capabilities/, finance/
  │
  ├── ProviderLoader ← communication/
  │     └── Discord, InternalChat, Email providers
  │
  └── Integrations (GitHub, Coolify, Email) ← github/, coolify/, email/
```

## Tamanho dos Arquivos

| Arquivo | Linhas | Complexidade |
|---------|--------|--------------|
| `github/manager.ts` | 1477 | Alta |
| `admin/routes.ts` | 1348 | Alta |
| `internal-chat-service.ts` | 1316 | Alta |
| `agent-runner.ts` | 1308 | Alta |
| `agent-long-term-memory-recall.ts` | 1220 | Alta |
| `database/schema.ts` | 801 | Média |
| `coolify/manager.ts` | 742 | Média |
| `discord-account.ts` | 676 | Média |
| `agent-runner-scheduler.ts` | 674 | Média |

## Patterns Encontrados

### Store Pattern

Módulos usam stores para gerenciar estado:

```typescript
const capabilities = createCapabilityStore(db);
const agentContracts = createAgentContractStore(db);
```

### Factory Pattern

Stores são factories que recebem `db`:

```typescript
export function createCapabilityStore(db: Database) {
  return {
    async getRole(roleId: string) { ... },
    async listPermissions(roleId: string) { ... },
  };
}
```

### Registry Pattern

O AgentRegistry mantém referências aos runtimes:

```typescript
class InternalAgentRegistry {
  private runtimes = new Map<string, InternalAgentRuntime>();
  
  add(runtime: InternalAgentRuntime) {
    this.runtimes.set(runtime.id, runtime);
  }
}
```

## Próximos Passos

- [Fluxo de Dados](./data-flow.md) — Como dados fluem pelo sistema
- [Estrutura de Arquivos](./file-structure.md) — Detalhes da estrutura
- [Padrões Arquiteturais](./patterns.md) — Patterns usados
