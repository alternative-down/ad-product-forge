# ad-product-forge Documentation

## System Overview

ad-product-forge is a local-first runtime for operating a company of persistent AI agents.

## Documentation Index

1. [System Overview](./01-overview.md) — What is Forge, stack, modules
2. [Architecture](./02-architecture.md) — System design, components, patterns
3. [Data Model](./03-data-model.md) — Database tables and relationships
4. [Agents](./04-agents.md) — Lifecycle, runtime, memory, capabilities
5. [Communication](./05-communication.md) — Providers (Discord, InternalChat, Email)
6. [Admin API](./06-admin-api.md) — REST endpoints and read models
7. [Integrations](./07-integrations.md) — GitHub, Coolify, Migadu, MiniMax
8. [Configuration](./08-configuration.md) — Environment variables, settings
9. [Tools](./09-tools.md) — Available tools for agents
10. [Monitoring](./10-monitoring.md) — Health checks, metrics, observability
11. [Troubleshooting](./11-troubleshooting.md) — Common issues and fixes
12. [Development](./12-development.md) — Setup, patterns, testing
13. [Security](./13-security.md) — Credentials, permissions, best practices

## Quick Start

```bash
npm install
openssl rand -base64 32  # generate ENCRYPTION_KEY
export ENCRYPTION_KEY=<key>
export DATABASE_URL=file:./data/forge.db
npm run dev
```
