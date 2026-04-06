---
name: coolify-api
description: Use Coolify through Forge credentials with direct curl requests for GitHub Apps, repositories, branches, applications, deployments, logs, and environment variables.
---

# Coolify API

Use this skill when work requires direct Coolify API access with `curl`.

## When to use

- The task needs to inspect or manage Coolify GitHub Apps.
- The task needs to inspect repositories or branches visible to one Coolify GitHub App.
- The task needs to create, update, restart, start, stop, or delete Coolify applications.
- The task needs deployment history, deployment logs, runtime logs, or environment variables.
- The task needs low-level API access instead of a higher-level orchestration layer.

## Workflow

1. Call `get_coolify_credentials` when it exists.
2. Read `references/get-coolify-credentials.md` to understand the expected credential fields.
3. Read `references/coolify-rest-api.md` for the shared `curl` pattern.
4. Choose the reference that matches the task:
   - GitHub Apps
   - applications
   - deployments and logs
   - environment variables
5. Keep changes scoped to the application or server actually targeted by the task.
6. Do not expose the raw admin token back to the user unless the task explicitly requires it.

## References

- Read `references/get-coolify-credentials.md` for the credential shape and usage rules.
- Read `references/coolify-rest-api.md` for the shared `curl` setup.
- Read `references/github-apps.md` for Coolify GitHub App, repository, and branch endpoints.
- Read `references/applications.md` for application lifecycle operations.
- Read `references/deployments-and-logs.md` for deployments and logs.
- Read `references/environment-variables.md` for application env management.
