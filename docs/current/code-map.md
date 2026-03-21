# Code Map

This file is a practical map of the current codebase for day-to-day navigation.

It does not try to explain every detail. It explains where each main responsibility currently lives.

## Application layer: `apps/forge/src`

### Startup and top-level wiring

- [main.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/main.ts)
  - application startup
  - env parsing
  - manager creation
  - workflow creation
  - registry load
  - HTTP server start
  - Mastra instantiation

### Agents

- [agents/create-forge-agent.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/create-forge-agent.ts)
  - internal runtime construction
  - workspace, sandbox, storage, memory, tool search wiring

- [agents/agent-loader.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-loader.ts)
  - load one or many persisted agents from the central database
  - decrypt communication providers
  - resolve capabilities
  - build allowed custom tools and workflows

- [agents/internal-agent-registry.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/internal-agent-registry.ts)
  - in-memory registry of loaded runtimes and runners

- [agents/agent-runner.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-runner.ts)
  - wake handling
  - execution loop
  - pacing and budget logic
  - step accounting

- [agents/hire-agent.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/hire-agent.ts)
  - low-level agent persistence and provisioning

- [agents/terminate-agent.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/terminate-agent.ts)
  - low-level agent cleanup and deletion

- [agents/internal-agent-lifecycle.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/internal-agent-lifecycle.ts)
  - higher-level orchestration for hiring and termination

### Workflows

- [workflows/internal-agents.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/workflows/internal-agents.ts)
  - internal workflow definitions exposed to agents

### Database and encryption

- [database/schema.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/database/schema.ts)
  - central database schema

- [database/index.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/database/index.ts)
  - database access entrypoint

- [encryption/crypto.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/encryption/crypto.ts)
  - encrypted provider credential handling

### Communication and providers

- [communication/provider-loader.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/communication/provider-loader.ts)
  - communication provider loading from decrypted credentials

- [communication/presets/internal-chat.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/communication/presets/internal-chat.ts)
  - internal chat preset provider

- [discord-account.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/discord-account.ts)
  - Discord provider implementation for Forge

- [email-account.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/email-account.ts)
  - runtime email communication provider

- [email/migadu-manager.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/email/migadu-manager.ts)
  - mailbox provisioning and deletion in Migadu

### Integrations

- [github/manager.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/github/manager.ts)
  - GitHub App lifecycle, tokens, API access, webhooks, agent notifications

- [github/tools.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/github/tools.ts)
  - GitHub custom tool surface

- [coolify/manager.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/coolify/manager.ts)
  - Coolify API access

- [coolify/tools.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/coolify/tools.ts)
  - Coolify custom tool surface

### Notifications and schedules

- [notifications/store.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/notifications/store.ts)
  - agent notification persistence

- [notifications/tools.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/notifications/tools.ts)
  - notification tool surface

- [schedules/store.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/schedules/store.ts)
  - schedule persistence

- [schedules/manager.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/schedules/manager.ts)
  - schedule runtime, node-schedule integration, heartbeat behavior

- [schedules/tools.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/schedules/tools.ts)
  - schedule tool surface

### Permissions and capability control

- [capabilities/catalog.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/capabilities/catalog.ts)
  - literal tool and workflow ids used by the permission model

- [capabilities/store.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/capabilities/store.ts)
  - role/function persistence and capability resolution

- [capabilities/runtime.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/capabilities/runtime.ts)
  - runtime reload and function-change side effects

- [capabilities/tools.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/capabilities/tools.ts)
  - capability management tool surface

### Finance

- [agents/agent-contract-store.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-contract-store.ts)
  - contract and spend reads/writes needed by the runner

- [finance/company-cash-ledger.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/finance/company-cash-ledger.ts)
  - company cash ledger writes

- [finance/company-cash-operations.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/finance/company-cash-operations.ts)
  - funding and operational cash functions

- [micro-erp/read-model.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/micro-erp/read-model.ts)
  - read-only financial and contract views for agents

- [micro-erp/tools.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/micro-erp/tools.ts)
  - micro ERP tool surface

### HTTP

- [http/server.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/http/server.ts)
  - minimal route registry and request handling

- [admin/read-model.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/admin/read-model.ts)
  - read-only admin-facing aggregation over runtime, schedules, roles, and finance

- [admin/routes.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/admin/routes.ts)
  - admin endpoint registration for the separate maintenance UI

## Admin UI layer: `apps/forge-admin/src`

- [main.tsx](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/main.tsx)
  - TanStack Query provider, Router provider, and root app bootstrap

- [router.tsx](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/router.tsx)
  - router creation from generated TanStack file-based route tree

- [routes/\_\_root.tsx](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/routes/__root.tsx)
  - shared admin shell route

- [features/overview/page.tsx](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/features/overview/page.tsx)
  - dashboard overview page

- [features/agents/page.tsx](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/features/agents/page.tsx)
  - agent maintenance page
  - runtime actions
  - schedule management

- [features/roles/page.tsx](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/features/roles/page.tsx)
  - role tool grant page

- [lib/api.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/lib/api.ts)
  - browser client for Forge admin endpoints

## Engine layer: `packages/mastra-engine/src`

### Communication module

- [agent/communication/module.ts](/home/nicolas/Documentos/github/ad-product-forge/packages/mastra-engine/src/agent/communication/module.ts)
  - provider wiring, inbound message handling, communication runtime

- [agent/communication/store.ts](/home/nicolas/Documentos/github/ad-product-forge/packages/mastra-engine/src/agent/communication/store.ts)
  - contacts, conversations, and messages

- [agent/communication/tools.ts](/home/nicolas/Documentos/github/ad-product-forge/packages/mastra-engine/src/agent/communication/tools.ts)
  - communication tool builders

### Memory

- [agent/memory/memory.ts](/home/nicolas/Documentos/github/ad-product-forge/packages/mastra-engine/src/agent/memory/memory.ts)
  - working memory integration

- [agent/memory/observational-memory.ts](/home/nicolas/Documentos/github/ad-product-forge/packages/mastra-engine/src/agent/memory/observational-memory.ts)
  - observational memory processor

- [agent/memory/long-term-memory.ts](/home/nicolas/Documentos/github/ad-product-forge/packages/mastra-engine/src/agent/memory/long-term-memory.ts)
  - long-term memory integration

### Wake and auth

- [agent/wake-queue.ts](/home/nicolas/Documentos/github/ad-product-forge/packages/mastra-engine/src/agent/wake-queue.ts)
  - wake queue primitive used by the runner

- [llm/oauth-gateway.ts](/home/nicolas/Documentos/github/ad-product-forge/packages/mastra-engine/src/llm/oauth-gateway.ts)
  - OAuth gateway used by the app

## Reading order

If the goal is to understand the current runtime quickly, read in this order:

1. [apps/forge/src/main.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/main.ts)
2. [apps/forge/src/agents/create-forge-agent.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/create-forge-agent.ts)
3. [apps/forge/src/agents/agent-loader.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-loader.ts)
4. [apps/forge/src/agents/agent-runner.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-runner.ts)
5. [apps/forge/src/database/schema.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/database/schema.ts)
6. [packages/mastra-engine/src/agent/communication/module.ts](/home/nicolas/Documentos/github/ad-product-forge/packages/mastra-engine/src/agent/communication/module.ts)
