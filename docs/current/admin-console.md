# Admin Console

Forge now includes a separate admin UI application in [apps/forge-admin](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin).

This application is intentionally narrow.

It exists for:

- runtime visibility
- agent maintenance
- agent hiring and termination
- agent function reassignment
- agent runtime config updates
- external provider credential updates
- read-only prompt inspection
- read-only notification inspection
- read-only communication inspection
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

The current UI uses file-based TanStack Router routes with a shared app shell.

Current route surface:

- `/`
  - overview
- `/agents`
  - agent maintenance
- `/roles`
  - role tool grants

Agent and role selection state lives in route search params:

- `/agents?agentId=...`
- `/roles?roleId=...`

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
- editable runtime config for the selected agent
- editable external provider credentials for the selected agent
- persisted agent instructions
- recent agent notifications
- recent agent conversations and message previews
- active execution contract
- heartbeat schedule
- editable agent schedules
- recent execution steps

Actions available:

- hire agent
- terminate agent
- reassign the selected agent function
- update agent runtime config
- upsert agent provider credentials
- delete external provider credentials
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

Current frontend anchors:

- [router.tsx](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/router.tsx)
- [\_\_root.tsx](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/routes/__root.tsx)
- [overview/page.tsx](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/features/overview/page.tsx)
- [agents/page.tsx](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/features/agents/page.tsx)
- [roles/page.tsx](/home/nicolas/Documentos/github/ad-product-forge/apps/forge-admin/src/features/roles/page.tsx)

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

- `POST /admin/agent/hire`
- `POST /admin/agent/terminate`
- `POST /admin/agent/change-function`
- `POST /admin/agent/update-config`
- `POST /admin/agent-provider/upsert`
- `POST /admin/agent-provider/delete`
- `POST /admin/agent/wake`
- `POST /admin/agent/reload`
- `POST /admin/agent-schedule/create`
- `POST /admin/agent-schedule/update`
- `POST /admin/agent-schedule/delete`
- `POST /admin/role-tool-permission/add`
- `POST /admin/role-tool-permission/remove`

## API base resolution

The admin frontend resolves the Forge API base in this order:

- `VITE_FORGE_API_BASE_URL`, when defined at build time
- automatic sibling host fallback from `forge-admin.*` to `forge.*`
- same-origin fallback when the admin UI is reverse-proxied with the API on the same host

Examples:

- admin on `https://forge-admin.example.com`
  - API fallback becomes `https://forge.example.com`
- admin and API behind one host
  - requests stay relative as `/admin/...`

## Runtime assumptions

- this UI assumes a local/trusted admin environment
- no separate authentication layer has been implemented yet
- the Vite dev server proxies `/admin` to the Forge HTTP server on port `3011`
