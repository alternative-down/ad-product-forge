# ad-product-forge

Forge is a local-first runtime for operating a company of persistent AI agents.

The current system already supports:

- persistent internal agents loaded from a central database
- hiring and termination workflows
- per-agent roles/functions with custom tool and workflow permissions
- internal communication, Discord, and real email mailboxes
- one GitHub App per agent
- GitHub issue/PR/repository work
- Coolify operations for deployment
- scheduled wakes and heartbeat
- contract-based execution accounting and a minimal company cash ledger

This repository is still in active development. The documentation source of truth is now the `docs/current/` directory.

For an explicit list of what is still missing, see [docs/current/known-gaps.md](./docs/current/known-gaps.md).

## Where to start

- [Current system docs](./docs/current/README.md)
- [Current code map](./docs/current/code-map.md)
- [Documentation index](./docs/README.md)
- [Roadmap](./ROADMAP.md)
- [Code style](./CODE_STYLE.md)
- [Agent instructions](./AGENTS.md)

## Repository structure

- `apps/forge/`
  - Main application runtime.
  - Owns the central database, hiring/termination, integrations, schedules, notifications, and HTTP endpoints.

- `apps/forge-admin/`
  - Separate human admin UI.
  - Owns the maintenance dashboard for runtime visibility, agent hiring/termination, schedules, and role tool grants.

- `packages/mastra-engine/`
  - Shared engine layer.
  - Owns communication abstractions, wake queue, memory components, and shared LLM gateway pieces.

- `docs/current/`
  - Current implemented behavior.

- `docs/planning/`
  - Future work still considered valid.

- `docs/backlog/`
  - Feature requests and exploratory product directions.

- `docs/references/`
  - Vision, external references, research notes, and historical architectural context.

- `docs/archive/`
  - Older documents preserved for traceability.

## Development

### Requirements

- Node.js `>=20`
- npm `>=10.9.4`

### Install

```bash
npm install
```

### Common commands

```bash
npm run dev
npm run typecheck
npm run build
npm run test
npm run format
```

## Current runtime entrypoints

- app startup: [apps/forge/src/main.ts](./apps/forge/src/main.ts)
- agent runtime builder: [apps/forge/src/agents/create-forge-agent.ts](./apps/forge/src/agents/create-forge-agent.ts)
- agent loader: [apps/forge/src/agents/agent-loader.ts](./apps/forge/src/agents/agent-loader.ts)
- internal workflows: [apps/forge/src/workflows/internal-agents.ts](./apps/forge/src/workflows/internal-agents.ts)

## Documentation rule

If a document describes what the system does today, it belongs in `docs/current/`.
If it describes what the system may do later, it belongs in `docs/planning/`.
