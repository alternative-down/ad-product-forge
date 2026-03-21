# Admin Console

Forge now includes a separate admin UI application in [apps/forge-admin](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin).

This application is intentionally narrow.

It exists for:

- runtime visibility
- agent maintenance
- schedule management
- role tool grant maintenance

It does not exist for:

- editing agent conversations or notifications
- operating GitHub or Coolify directly
- editing role or function definitions
- changing agent prompts or other internal cognitive configuration

## Current frontend stack

- Vite
- React
- TanStack Query
- TanStack Router
- Tailwind CSS

The current UI is a single-screen SPA with three sections:

- `Overview`
- `Agents`
- `Roles`

## Current behavior

### Overview

Shows:

- total agents
- loaded agents
- running vs idle counts
- function and role counts
- active contract count
- company cash balance
- current cash summary
- recent company cash movements
- read-only function map

### Agents

Shows:

- agent identity and current function/role
- persisted execution state
- loaded status
- runner snapshot from memory
- provider types configured for the agent
- workspace configuration summary
- active execution contract
- heartbeat schedule
- editable agent schedules
- recent execution steps

Actions available:

- wake agent
- reload agent runtime
- create agent schedule
- update agent schedule
- delete agent schedule

Heartbeat is visible but not editable from the UI.

### Roles

Shows:

- role identity
- assigned function count
- granted workflow ids
- read-only list of functions attached to the role

Editable here:

- custom tool grants for each role

Not editable here:

- role creation
- role renaming
- function creation
- function reassignment
- workflow grants

## Backend boundary

The frontend is a thin client over admin-specific HTTP endpoints registered by Forge itself.

Current backend code:

- [admin/read-model.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/admin/read-model.ts)
- [admin/routes.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/admin/routes.ts)

The admin API is intentionally separate from:

- agent-facing tools
- provider webhooks
- workflow execution APIs

This keeps the UI in the maintenance layer instead of reusing agent tool surfaces as a human API.

## Current endpoint surface

Read endpoints:

- `GET /admin/overview`
- `GET /admin/agents`
- `GET /admin/agent?agentId=...`
- `GET /admin/functions`
- `GET /admin/roles`

Mutation endpoints:

- `POST /admin/agent/wake`
- `POST /admin/agent/reload`
- `POST /admin/agent-schedule/create`
- `POST /admin/agent-schedule/update`
- `POST /admin/agent-schedule/delete`
- `POST /admin/role-tool-permission/add`
- `POST /admin/role-tool-permission/remove`

## Runtime assumptions

- this UI assumes a local/trusted admin environment
- no separate authentication layer has been implemented yet
- the Vite dev server proxies `/admin` to the Forge HTTP server on port `3011`

For production, the intended model is same-origin or reverse-proxied deployment behind trusted infrastructure.
