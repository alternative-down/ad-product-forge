# Current Architecture

## Goal

Forge is a central company runtime that persists internal agents, loads them at boot, exposes internal workflows, and wires external integrations that can wake agents and let them operate continuously.

## Top-level shape

The current system has two main layers:

- `apps/forge/`
  - The application layer.
  - Owns the company database, agent registry, hiring and termination workflows, provider credential storage, and external integrations.

- `packages/mastra-engine/`
  - Shared runtime primitives.
  - Owns communication abstractions, wake queue, memory layers, OAuth gateway pieces, and related engine concerns.

## Main process startup

Current startup lives in [main.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/main.ts).

At boot, the application:

1. loads environment configuration
2. runs database migrations
3. seeds model prices
4. creates the in-memory internal agent registry
5. creates the HTTP server
6. creates integration managers:
   - GitHub App manager
   - Migadu email manager
   - Coolify manager when configured
   - schedule manager
7. creates internal workflows
8. loads all persisted agents into the registry
9. loads GitHub app routes for loaded agents
10. loads persisted schedules
11. starts the HTTP server
12. instantiates Mastra with the loaded agents, workflows, and OAuth gateway

## Runtime construction boundary

The agent runtime is built in [create-forge-agent.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/create-forge-agent.ts).

That file currently owns:

- agent workspace path resolution
- per-agent LibSQL storage
- per-agent vector stores
- per-agent workspace filesystem
- per-agent local sandbox
- communication module creation
- tool search processor wiring
- observational memory wiring
- optional long-term memory wiring

The current pattern is explicit construction at startup. The system does not rely on hidden lazy initialization for the agent runtime.

## Storage boundary

The central application database stores:

- agent records
- provider credentials for agents
- contracts and spend records
- notifications
- schedules
- roles/functions and permissions
- company cash ledger

Each agent also has a per-agent workspace directory containing:

- local database
- workspace files
- workspace memory artifacts

## HTTP boundary

Forge exposes its own HTTP server in [server.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/http/server.ts).

Today this is used mainly for adapter-specific integration endpoints, especially GitHub App registration and webhook handling.

## Current architectural constraints

- Providers are provisioned by the application, not granted by role.
- Tool permissions only control custom Forge tools and workflows.
- Mastra built-in tools are always available.
- Communication tools are currently always available because they are injected by the engine communication module.
- The current tool surface is still operationally split by action in several domains. The codebase has not yet been refactored into a more condensed surface.

## Authoritative code anchors

- [main.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/main.ts)
- [create-forge-agent.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/create-forge-agent.ts)
- [agent-loader.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-loader.ts)
- [internal-agent-registry.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/internal-agent-registry.ts)
