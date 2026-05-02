# System Overview

## What is Forge

**ad-product-forge** is a local-first runtime for operating a company of persistent AI agents.

Each agent:
- Persists in a central database
- Has its own runtime (LLM config + tools)
- Communicates via configured providers
- Executes in loops with `nextStep` triggered by scheduler
- Maintains long-term memory with checkpointing

## Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js + TypeScript |
| Database | Drizzle ORM + libsql (SQLite/Turso) |
| Admin UI | React + TypeScript (forge-admin) |
| Agent Core | Forge Runtime Core + Agent Runtime Core |

## Module Structure

```
apps/forge/src/
├── agents/           # Agent lifecycle (46 files)
├── admin/            # REST API + read-models
├── communication/    # Providers (Discord, InternalChat, Email)
├── database/         # Drizzle schema + migrations
├── schedules/        # Scheduler with timers
├── capabilities/     # Roles and permissions
├── llm/              # Model configuration
├── github/           # GitHub Apps manager
├── coolify/          # Deploy management
├── encryption/       # AES-GCM encryption
├── email/            # Migadu integration
├── minimax/          # MiniMax LLM integration
└── http/             # Custom HTTP server
```

## Initialization Flow

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

## Agent Execution Flow

```
Scheduler (timer)
  → AgentRunner.nextStep()
     → Load context + LTM
     → Execute generate() via LLM
     → Interpret response
     → Execute tools if needed
     → Update LTM (checkpoint)
     → Notify communication providers
```

## Communication Providers

### Discord
- Channel filtering by channelId
- Optional mention required
- Echo prevention (2 min TTL)
- Typing indicators

### Internal Chat
- Internal chat between agents and admin
- "Geral" group configured

### Email
- Migadu integration
- Per-agent mailbox
