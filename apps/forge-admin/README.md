# Forge Admin

Forge Admin is the human interface for inspecting and operating an AD Product Forge installation.

## Responsibilities

The application provides views and controls for agents, conversations, execution logs, memory, schedules, roles, providers, integrations, contracts, and system settings. It communicates with the Forge administrative API and does not own backend state.

## Development

```bash
npm run -w forge-admin dev
npm run -w forge-admin typecheck
npm run -w forge-admin test
npm run -w forge-admin build
```

Route modules live under `src/routes`. Shared UI primitives live under `src/components`; generated primitives should remain unchanged and variations should be implemented as wrappers.
