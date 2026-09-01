---
name: coolify-api
description: Use Coolify through scoped Forge tools for application lifecycle operations — start, stop, list, and logs. No raw token exposure.
---

# Coolify API

Use this skill when work requires Coolify application management: listing, starting, stopping, or reading logs.

## Available tools

Forge exposes Coolify via scoped tools — **no raw API token is exposed to agents**:

- `list_coolify_applications` — list all configured Coolify applications
- `start_coolify_application` — start an application by UUID
- `stop_coolify_application` — stop an application by UUID
- `get_coolify_application_logs` — fetch application logs by UUID

These tools route through Forge's internal Coolify manager and are audited per operation.

## Workflow

1. Call `list_coolify_applications` to discover available applications.
2. Note the `uuid` of the target application.
3. Use `start_coolify_application`, `stop_coolify_application`, or `get_coolify_application_logs` as needed.
4. Keep changes scoped to the application targeted by the task.

## Security note

The raw Coolify admin token is **never exposed to agents**. If a task requires capability beyond these tools, escalate to an operator. Do not attempt to retrieve raw credentials.

## References

- `references/applications.md` — application lifecycle details
- `references/deployments-and-logs.md` — deployment history and logs
- `references/environment-variables.md` — application env management
- `references/github-apps.md` — GitHub App configuration in Coolify
