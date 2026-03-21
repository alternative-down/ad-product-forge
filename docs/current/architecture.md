# Current Architecture

## Goal

Forge is a central company runtime that persists internal agents, loads them at boot, exposes internal workflows, and wires external integrations that can wake agents and let them operate continuously.

## Top-level shape

The current system has three main layers:

- `apps/forge/`
  - The application layer.
  - Owns the company database, agent registry, hiring and termination workflows, provider credential storage, integrations, schedules, notifications, and HTTP routes.

- `apps/forge-admin/`
  - Human admin layer.
  - Owns the maintenance dashboard for runtime visibility and safe administrative actions.

- `packages/mastra-engine/`
  - Shared runtime primitives.
  - Owns communication abstractions, wake queue, memory layers, and shared LLM gateway pieces.

## Main process startup

Current startup lives in [main.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/main.ts).

At boot, the application:

1. loads environment configuration
2. runs database migrations
3. seeds model prices
4. creates the internal registry
5. creates the HTTP server
6. creates integration managers:
   - GitHub App manager
   - Migadu email manager
   - Coolify manager when configured
   - schedule manager
7. creates internal workflows
8. loads all persisted agents into the registry
9. loads GitHub routes for loaded agents
10. loads persisted schedules into memory
11. starts the HTTP server
12. instantiates Mastra with the loaded agents, workflows, and OAuth gateway

## Registry model

The registry is not just a list of agents.

Current registry entries contain:

- the loaded internal runtime
- the runner that owns wake and execution behavior for that runtime

This means the application boundary is:

- central process owns agent lifecycle
- registry owns loaded runtime instances
- runner owns execution pacing and wake handling per loaded agent

## Runtime construction boundary

The agent runtime is built in [create-forge-agent.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/create-forge-agent.ts).

That file currently owns:

- agent workspace path resolution
- per-agent LibSQL storage
- per-agent vector stores
- per-agent workspace filesystem
- per-agent local sandbox
- communication module creation
- `ToolSearchProcessor` wiring
- observational memory wiring
- optional long-term memory wiring

The current pattern is explicit construction at startup. The system does not rely on hidden lazy initialization for the agent runtime.

## Tool exposure model

A current architectural detail that matters:

- the runtime builds a searchable tool set from communication tools plus Forge custom tools
- that set is passed into `ToolSearchProcessor`
- the agent itself is created with `tools: {}`

So the live interaction model is not “inject every tool directly into the agent”.

It is:

- searchable tool catalog at runtime
- tool discovery through the processor
- progressive disclosure of tool access inside the agent loop

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

Today this is used for:

- provider-specific integration endpoints, especially GitHub App registration and GitHub webhook handling
- admin maintenance endpoints consumed by `apps/forge-admin`

## Current architectural constraints

- providers are provisioned by the application, not granted by role
- tool permissions only control custom Forge tools and workflows
- Mastra built-in tools are always available
- communication tools are always available through the communication module path
- the current tool surface is still operationally split by action in several domains and has not yet been condensed
- Coolify state is not mirrored into local business entities

## Authoritative code anchors

- [main.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/main.ts)
- [create-forge-agent.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/create-forge-agent.ts)
- [agent-loader.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-loader.ts)
- [internal-agent-registry.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/internal-agent-registry.ts)
- [agent-runner.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/agents/agent-runner.ts)
