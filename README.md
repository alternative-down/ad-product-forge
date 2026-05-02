# ad-product-forge

A local-first runtime for operating a company of persistent AI agents.

## What it does

- Persistent internal agents loaded from a central database
- Hiring and termination workflows
- Per-agent roles/functions with custom tool and workflow permissions
- Internal communication, Discord, and real email mailboxes
- One GitHub App per agent
- GitHub issue/PR/repository work
- Coolify operations for deployment
- Scheduled wakes and heartbeat
- Contract-based execution accounting and a minimal company cash ledger

## Quick Start

```bash
npm install

# Generate encryption key
openssl rand -base64 32

# Set environment
export ENCRYPTION_KEY=<your-key>
export DATABASE_URL=file:./data/forge.db

npm run dev
```

## Documentation

See [`docs/`](docs/) for full system documentation.

## Repository structure

- `apps/forge/` — Main application runtime. Owns the central database, hiring/termination, integrations, schedules, notifications, and HTTP endpoints.
- `apps/forge-admin/` — Separate human admin UI. Maintenance dashboard for runtime visibility, agent lifecycle, runtime config, provider credentials, schedules, and role tool grants.
- `packages/agent-runtime-core/` — Agent runtime core: actions, memory, integrations, adapters, and gateways.
- `packages/forge-runtime-core/` — Forge runtime core: internal-chat service, workflow registry, agent lifecycle.
- `docs/` — System documentation.

## Branching

- `main` — Production
- `stage` — Staging
- `develop` — Integration

## Status

Active development. Documentation is the source of truth for current implemented behavior.
