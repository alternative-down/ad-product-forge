# Configuration and Endpoints

## Environment configuration

Current application environment is defined primarily in [main.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/main.ts) and [crypto.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/encryption/crypto.ts).

## Required variables

### Always required

- `ENCRYPTION_KEY`
  - base64-encoded 32-byte AES-256-GCM key used to encrypt and decrypt `agent_providers.encryptedCredentials`

- `GITHUB_ORGANIZATION`
  - organization name used by the GitHub App manager

### Optional with defaults

- `FORGE_LOG_LEVEL`
  - `debug | info | warn | error`
  - defaults to `warn`

- `WORKSPACE_BASE_PATH`
  - defaults to `./workspaces`

- `FORGE_HTTP_PORT`
  - defaults to `3011`

- `FORGE_PUBLIC_BASE_URL`
  - defaults to local server URL derived from `FORGE_HTTP_PORT`

- `GITHUB_APP_HOME_URL`
  - defaults to the public base URL

### Optional, but required in pairs or groups when that integration is enabled

- Migadu provisioning
  - `MIGADU_API_USER`
  - `MIGADU_API_KEY`

- Coolify integration
  - `COOLIFY_BASE_URL`
  - `COOLIFY_ADMIN_TOKEN`
  - `COOLIFY_APPLICATIONS_BASE_DOMAIN`

Current runtime rule:

- if only part of the Migadu pair is provided, startup fails
- if only part of the Coolify config is provided, startup fails

## HTTP server

Forge owns its own HTTP server in [server.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/http/server.ts).

The server is intentionally minimal:

- exact method and path matching
- in-memory route registry
- full request body buffering
- no framework layer
- Zod request errors return HTTP `400`

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

Mutation surface:

- `POST /admin/agent/hire`
- `POST /admin/agent/terminate`
- `POST /admin/agent/change-function`
- `POST /admin/agent/wake`
- `POST /admin/agent/reload`
- `POST /admin/agent-schedule/create`
- `POST /admin/agent-schedule/update`
- `POST /admin/agent-schedule/delete`
- `POST /admin/role-tool-permission/add`
- `POST /admin/role-tool-permission/remove`

These routes are for the human admin UI, not for agent-facing work.

## Current endpoint model

Today, Forge uses explicit provider-specific HTTP endpoints where the integration actually needs them.

That is currently true for:

- GitHub integration routes
- admin maintenance routes

Coolify webhook support is still not implemented.
