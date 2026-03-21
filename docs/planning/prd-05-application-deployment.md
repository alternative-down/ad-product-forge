# PRD-05: Coolify Integration

**Status:** Planned
**Classification:** FORGE APP

## 1. Goal

Integrate Forge directly with **Coolify** so internal agents can manage deployments through agent-facing tools.

This PRD is about:
- one direct Coolify integration
- administration tools for internal agents
- using the official Coolify HTTP API

This PRD is not about:
- introducing new business entities such as `projects` or `applications`
- storing local deployment records
- webhook routing
- modeling ownership or repository linkage inside Forge

## 2. Core Direction

The first version is intentionally small:
- Forge talks directly to one Coolify instance
- authentication uses one company-level admin token
- agents call Coolify through Forge tools
- Forge does not create new local deployment tables for this integration

The deployment state remains in Coolify.
Forge acts as the integration layer.

## 3. Credential Boundary

Coolify uses one central company credential:
- `COOLIFY_BASE_URL`
- `COOLIFY_ADMIN_TOKEN`
- `COOLIFY_APPLICATIONS_BASE_DOMAIN`

This credential:
- is not stored in communication `accounts`
- is not stored in `agent_providers`
- is not exposed to agents

Agents only receive tool access through Forge.

## 4. Repository Assumption

Coolify deployment starts from repositories that already exist in the company GitHub organization.

The first version should use the Coolify flow based on its own GitHub App integration:
- reuse a preconfigured Coolify GitHub App entry
- list repositories available through that GitHub App
- create the Coolify application from that repository

Forge does not need a local repository-link table for the first version.

## 5. Tool Surface

The first version should expose these tools:

1. `list_coolify_github_apps`
2. `list_coolify_github_app_repositories`
3. `list_coolify_github_app_repository_branches`
4. `list_coolify_applications`
5. `create_coolify_application`
6. `get_coolify_application`
7. `update_coolify_application`
8. `start_coolify_application`
9. `stop_coolify_application`
10. `restart_coolify_application`
11. `delete_coolify_application`
12. `list_coolify_application_deployments`
13. `get_coolify_deployment_logs`
14. `get_coolify_application_logs`
15. `list_coolify_application_envs`
16. `set_coolify_application_env`
17. `delete_coolify_application_env`

These tools are literal wrappers around the Coolify operational surface needed by agents.
They should stay explicit and provider-specific.

## 6. Creation Direction

`create_coolify_application` should be intentionally narrow.

The agent should provide only:
- application name
- application slug
- port
- build command
- start command

Forge should fill the rest of the initial shape internally:
- repository source through the Coolify GitHub App flow
- domain as a subdomain of the company base domain from env
- default Coolify project/environment/server/destination context
- let Coolify keep its normal defaults for proxy and related configuration

The first version should not expose broad creation-time configuration knobs.

## 7. Update Direction

`update_coolify_application` should support partial updates only.

That means an agent can change one thing without resending the full application shape.

Examples:
- change only the port
- change only the build command
- change only the start command
- change one configuration field

## 8. Env Variable Direction

Environment variables should be managed by partial update, not full replacement.

That means:
- add one env var
- update one env var
- delete one env var

This avoids accidental overwrites and keeps the operational flow safer for agents.

## 9. Logs

The first version must include:
- deployment logs
- application/runtime logs

Agents need both to operate deployed systems without leaving Forge.

## 10. Webhooks

Webhooks are explicitly out of scope for the first version.

This PRD does not define:
- Coolify webhook endpoints
- Coolify event persistence
- Coolify-triggered agent notifications

Those can be added later if the direct tool-based operation proves insufficient.

## 11. API Direction

Forge should use the **official Coolify HTTP API** directly.

Forge should not depend on:
- `coolify-cli`
- third-party Coolify wrappers
- shelling out to external deployment tooling

The CLI can still be useful for manual debugging, but it should not be the base of the application integration.

## 12. Domain Direction

The public domain of a new Coolify application should be derived inside Forge.

The first version should always use:
- subdomain of `COOLIFY_APPLICATIONS_BASE_DOMAIN`

Agents do not choose arbitrary domains during creation.

## 13. Design Rules

- no new local business entity is introduced for this integration
- no local deployment record is required in the first version
- Coolify remains the source of truth for deployment state
- Forge provides tool access and credential isolation
- the integration stays Coolify-specific
- tool names stay literal
- creation stays narrow and default-heavy
- update flows stay partial

## 14. Success Criteria

- agents can connect Coolify to GitHub through the Coolify GitHub App flow
- agents can create applications in Coolify through Forge tools
- agents can inspect status and logs through Forge tools
- agents can update configuration and env vars through Forge tools
- agents can start, stop, restart, and delete applications through Forge tools
- the integration works with one company-level admin token
- no extra deployment schema is introduced in Forge
