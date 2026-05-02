# Estrutura de Arquivos

## Visão Geral

```
ad-product-forge/
├── apps/
│   ├── forge/                    # Main application
│   │   ├── src/
│   │   │   ├── main.ts          # Entry point
│   │   │   ├── agents/          # Agent lifecycle
│   │   │   ├── admin/           # Admin REST API
│   │   │   ├── communication/    # Providers
│   │   │   ├── database/         # Schema
│   │   │   ├── schedules/        # Scheduler
│   │   │   ├── capabilities/     # Roles/Permissions
│   │   │   ├── llm/              # LLM config
│   │   │   ├── github/           # GitHub integration
│   │   │   ├── coolify/          # Coolify integration
│   │   │   ├── email/            # Email integration
│   │   │   ├── encryption/       # Crypto
│   │   │   └── http/             # HTTP server
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── forge-admin/             # Admin UI
│       └── src/
├── packages/
│   ├── agent-runtime-core/       # Core runtime
│   └── forge-runtime-core/       # Forge core
├── docs/                        # Esta documentação
├── data/                        # SQLite database
├── workspaces/                  # Agent workspaces
├── package.json
└── turbo.json
```

## apps/forge/src/

### main.ts

Entry point do sistema.

```typescript
// apps/forge/src/main.ts
import { getInternalAgentRegistry } from './agents/internal-agent-registry';
import { createAgentScheduleManager } from './schedules/manager';
import { registerAdminRoutes } from './admin/routes.js';

export async function main() {
  // 1. Criar registry
  const registry = getInternalAgentRegistry();
  
  // 2. Criar stores
  const agentContracts = createAgentContractStore(db);
  const capabilities = createCapabilityStore(db);
  
  // 3. Carregar agentes
  await registry.loadAll();
  
  // 4. Iniciar scheduler
  const scheduler = createAgentScheduleManager({ db, registry });
  
  // 5. Registrar rotas
  registerAdminRoutes({ db, registry, scheduler });
  
  // 6. Iniciar servidor
  startHttpServer(3000);
}
```

### agents/

```
agents/
├── internal-agent-registry.ts      # Registry central
├── agent-runner.ts                # Loop de execução
├── agent-runner-scheduler.ts      # Scheduler
├── agent-runtime-platform.ts      # Runtime concreto
├── agent-runtime.ts               # Interface do runtime
├── agent-loader.ts                # Loader de agentes
├── agent-long-term-memory.ts      # LTM
├── agent-long-term-memory-recall.ts
├── agent-long-term-memory-store.ts
├── hire-agent.ts                  # Hiring workflow
├── terminate-agent.ts             # Termination workflow
├── agent-contract-store.ts        # Store de contratos
├── capabilities/
│   └── store.ts                   # Store de capabilities
└── skills/
    └── manager.ts                 # Skills manager
```

### admin/

```
admin/
├── routes.ts                      # 1348 linhas, 26 rotas
├── read-model/
│   ├── index.ts                   # Read model principal
│   ├── agents.ts
│   ├── helpers.ts
│   └── *.ts
└── routes/
    ├── agents/                    # Rotas de agentes
    │   ├── read.ts
    │   ├── write.ts
    │   └── operations.ts
    ├── schedules/
    ├── roles/
    ├── finance/
    └── internal-chat/
```

### communication/

```
communication/
├── provider-loader.ts             # Loader de providers
├── discord-account.ts             # Provider Discord
├── internal-chat-service.ts       # Internal chat (1316 linhas)
├── internal-chat-groups.ts       # Grupos internos
├── types.ts                       # Tipos de comunicação
├── discord-types.ts
└── email/
    └── migadu-manager.ts          # Email manager
```

### database/

```
database/
├── schema.ts                      # Schema Drizzle (~801 linhas)
├── index.ts                       # Exports
├── migrations/                    # Migrations Drizzle
│   ├── 0000_init.sql
│   └── meta/
└── client.ts                      # Database client
```

### integrations/

```
github/
├── manager.ts                     # ~1477 linhas
├── types.ts
└── tools/
    ├── issues.ts
    ├── pull-requests.ts
    ├── repositories.ts
    └── index.ts

coolify/
├── manager.ts                     # ~742 linhas
└── types.ts

email/
├── migadu-manager.ts
└── types.ts

minimax/
└── manager.ts
```

## packages/

### agent-runtime-core/

```
agent-runtime-core/
├── src/
│   ├── runtime.ts                 # Base runtime
│   ├── actions/                   # Actions
│   ├── memory/                   # Memory interfaces
│   ├── integrations/             # Integration adapters
│   └── index.ts
└── package.json
```

### forge-runtime-core/

```
forge-runtime-core/
├── src/
│   ├── internal-chat-service.ts   # Internal chat core
│   ├── workflow-registry.ts      # Workflow registry
│   ├── agent-lifecycle.ts         # Lifecycle management
│   └── index.ts
└── package.json
```

## Arquivos Importantes

### apps/forge/src/database/schema.ts

Define todas as tabelas do sistema:

```typescript
// Tabelas
export const agents = sqliteTable('agents', {...});
export const agentRoles = sqliteTable('agent_roles', {...});
export const agentProviders = sqliteTable('agent_providers', {...});
export const agentExecutionContracts = sqliteTable('agent_execution_contracts', {...});
export const agentExecutionSteps = sqliteTable('agent_execution_steps', {...});
export const schedules = sqliteTable('schedules', {...});
export const systemSettings = sqliteTable('system_settings', {...});
```

### apps/forge/src/admin/routes.ts

26 rotas da API admin:

```typescript
// Agentes
POST   /admin/agent
GET    /admin/agent
GET    /admin/agent/:agentId
PUT    /admin/agent/:agentId
DELETE /admin/agent/:agentId

// Schedules
POST   /admin/schedule
GET    /admin/schedules
PUT    /admin/schedule/:scheduleId
DELETE /admin/schedule

// Roles
POST   /admin/role
GET    /admin/roles
PUT    /admin/role/:roleId
DELETE /admin/role/:roleId

// E mais...
```
