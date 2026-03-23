# Current Integrations

## Communication

Communication providers are loaded through [provider-loader.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/communication/provider-loader.ts).

Current communication providers:

- `internal-chat`
- `discord`
- `email`

### Internal chat

Internal chat is a preset provider used for agent-to-agent communication.

It is provisioned during hiring through encrypted provider credentials and includes:

- `agentId`
- `displayName`
- `description`

That description is used as function context in contact listings.

### Discord

Discord is a runtime communication provider, not a role permission. If credentials exist for an agent, the provider is loaded.

### Email

Email uses real mailboxes provisioned through Migadu. Runtime communication is still IMAP/SMTP based.

Administrative provisioning uses:

- global Migadu integration config in the admin console

Per-agent mailbox credentials are stored encrypted in `agent_providers`.

## GitHub

GitHub integration is owned by [github/manager.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/github/manager.ts).

Current model:

- one GitHub App per internal agent
- app installed on the organization
- broad repository access at the organization level
- webhooks are exposed per agent through Forge HTTP routes
- webhook events create text notifications and wake the target agent

Current authentication boundary:

- `appId`
- `privateKey`
- `installationId`
- `webhookSecret`

These are stored as encrypted provider credentials for the agent.

Git operations use HTTPS installation credentials, not SSH.

## Coolify

Coolify integration is owned by [coolify/manager.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/coolify/manager.ts).

Current model:

- direct use of Coolify HTTP API
- one central admin token for the company
- no local deployment entity or mirror table
- the agent operates directly on Coolify resources through tools

Current required configuration:

- global Coolify integration config in the admin console

Current creation direction:

- Coolify is expected to already know the GitHub App source
- agents create applications from repository source using Coolify defaults
- Forge derives the application domain from the configured base domain

Current webhook support for Coolify is not implemented.

## MiniMax

MiniMax text model access is owned by:

- [profile-token-gateway.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/llm/profile-token-gateway.ts)
- [settings-store.ts](/home/nicolas/Documentos/github/ad-product-forge/apps/forge/src/llm/settings-store.ts)

Current model:

- each MiniMax profile must carry its own direct API token
- anthropic-compatible HTTP endpoint
- exposed to agents through `custom/minimax/...`
- selectable in admin-managed LLM profiles and hiring defaults

Current supported MiniMax model surface:

- `MiniMax-M2.5`

## HTTP integration boundary

The current Forge HTTP server is used where adapter-specific endpoints are required.

This is currently true for GitHub App registration and GitHub webhook handling.
