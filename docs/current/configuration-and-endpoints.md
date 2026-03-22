# Configuration and Endpoints

## Environment configuration

Current application environment is defined primarily in [main.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/main.ts) and [crypto.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/encryption/crypto.ts).

## Required variables

### Always required

- `ENCRYPTION_KEY`
  - base64-encoded 32-byte AES-256-GCM key used to encrypt and decrypt sensitive provider credentials and global integration configs

### Optional with defaults

- `FORGE_LOG_LEVEL`
  - `debug | info | warn | error`
  - defaults to `warn`

- `WORKSPACE_BASE_PATH`
  - defaults to `./workspaces`

- `FORGE_DATA_PATH`
  - defaults to `./data`
  - the main Forge SQLite database is stored at `{FORGE_DATA_PATH}/agents.db`

- `FORGE_HTTP_PORT`
  - defaults to `3011`

- `FORGE_PUBLIC_BASE_URL`
  - defaults to local server URL derived from `FORGE_HTTP_PORT`

- `FORGE_ADMIN_API_KEY`
  - when set, every `/admin/*` request must include the `x-forge-admin-api-key` header
  - used by the admin UI and stored only in browser localStorage on the admin host

## Current system integration model

Global provider integrations are no longer configured from Forge environment variables.

Current global integrations are stored in the application database:

- `migadu`
- `coolify`
- `github`

Current LLM defaults are also stored in the application database:

- reusable `llm_profiles`
- one `system_llm_defaults` row that points to the active defaults for:
  - primary hiring model
  - OM model
  - hiring RH model

These configs are:

- created and updated through the admin console
- stored encrypted in `system_integrations.encrypted_config`
- loaded by the runtime at use time instead of only at boot

This keeps Forge environment variables focused on application bootstrap, not operational provider setup.

## HTTP server

Forge owns its own HTTP server in [server.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/http/server.ts).

The server is intentionally minimal:

- exact method and path matching
- in-memory route registry
- full request body buffering
- no framework layer
- Zod request errors return HTTP `400`
- CORS is enabled for browser-based admin access
- `OPTIONS` preflight requests return `204`
- admin routes can be protected by `FORGE_ADMIN_API_KEY`

## Current GitHub endpoints

GitHub App routes are registered per agent by the GitHub manager.

Current route patterns:

- `GET /github/apps/{agentId}/register`
- `GET /github/apps/{agentId}/manifest/callback`
- `GET /github/apps/{agentId}/setup`
- `POST /webhooks/github/{agentId}`

These are adapter-specific endpoints, not a generic webhook bus.

## Current admin endpoints

Admin routes are registered centrally at startup.

Read surface:

- `GET /admin/overview`
- `GET /admin/agents`
- `GET /admin/agent?agentId=...`
- `GET /admin/functions`
- `GET /admin/roles`
- `GET /admin/system/integrations`
- `GET /admin/system/llm`

Mutation surface:

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
- `POST /admin/system/integration/upsert`
- `POST /admin/system/integration/delete`
- `POST /admin/system/llm/profile/upsert`
- `POST /admin/system/llm/profile/delete`
- `POST /admin/system/llm/defaults/update`

These routes are for the human admin UI, not for agent-facing work.

## Current endpoint model

Today, Forge uses explicit provider-specific HTTP endpoints where the integration actually needs them.

That is currently true for:

- GitHub integration routes
- admin maintenance routes

Coolify webhook support is still not implemented.
